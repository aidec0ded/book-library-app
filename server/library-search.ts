import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle } from "./book-lookup.js";
import { embeddingsConfigured, embedQuery, toPgVector } from "./embeddings.js";
import { formatBookLine, INDEX_LEGEND, type BookTag, type IndexBook } from "./library-index.js";

/**
 * search_library: the reader's whole library, including the unread books and
 * wishlist the chat prompt leaves out (see buildLibraryIndex). Runs on the reader's
 * own Supabase client, so RLS keeps it to their books.
 */
export interface LibrarySearchCommand {
  query?: string;
  about?: string;
  like_title?: string;
  status?: string[];
  tags?: string[];
  book_type?: "fiction" | "nonfiction" | "poetry";
  sort?: "predicted_rating" | "title" | "recently_finished" | "recently_added";
  limit?: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;
const STATUSES = new Set(["read", "unread", "reading", "unfinished", "wishlist"]);
const FIELDS = "id, title, author, book_type, status, rating, genre, is_favorite, predicted_rating, date_finished, page_count";

/** Words of the query, without characters that would break a PostgREST filter. */
function queryWords(query: string): string[] {
  return query
    .replace(/[,()"'\\*%]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);
}

async function fetchTags(supabase: SupabaseClient, ids: string[]): Promise<Map<string, BookTag[]>> {
  const { data: tagRows, error } = await supabase
    .from("book_vibes")
    .select("book_id, vibe, tag_category")
    .eq("is_canonical", true)
    .in("book_id", ids);
  if (error) throw error;
  const tagMap = new Map<string, BookTag[]>();
  for (const row of tagRows ?? []) {
    tagMap.set(row.book_id, [...(tagMap.get(row.book_id) ?? []), row]);
  }
  return tagMap;
}

/**
 * Search by meaning: books whose title, author, genre, and summary are closest to a
 * description, or to one of the reader's books. Other filters narrow the results.
 */
async function searchByMeaning(
  supabase: SupabaseClient,
  command: LibrarySearchCommand,
  limit: number,
  tags: string[],
  statuses: string[],
): Promise<string> {
  if (!embeddingsConfigured()) {
    return "Search by meaning isn't available right now. Search by title, author, tags, or type instead.";
  }

  let likeBook: { id: string; title: string } | null = null;
  let queryEmbedding: string | null = null;
  if (command.like_title) {
    likeBook = await findBookByTitle(supabase, command.like_title);
    if (!likeBook) return `No book in the library matches "${command.like_title}".`;
  } else {
    queryEmbedding = toPgVector(await embedQuery(command.about!));
  }

  const words = queryWords(command.query ?? "").map((w) => w.toLowerCase());
  const narrowing = tags.length > 0 || words.length > 0;
  const { data: matches, error } = await supabase.rpc("match_books", {
    query_embedding: queryEmbedding,
    like_book_id: likeBook?.id ?? null,
    statuses: statuses.length > 0 ? statuses : null,
    only_type: command.book_type ?? null,
    match_count: narrowing ? Math.min(limit * 4, 200) : limit,
  });
  if (error) throw error;
  const ranked = (matches ?? []) as { book_id: string; similarity: number }[];
  if (ranked.length === 0) {
    return likeBook
      ? `"${likeBook.title}" hasn't been prepared for search by meaning yet. New and edited books are ready within about 10 minutes.`
      : "No books in the library match that search.";
  }

  const ids = ranked.map((m) => m.book_id);
  const { data, error: booksError } = await supabase.from("books").select(FIELDS).in("id", ids);
  if (booksError) throw booksError;
  const byId = new Map(((data ?? []) as unknown as IndexBook[]).map((b) => [b.id, b]));
  const tagMap = await fetchTags(supabase, ids);

  const results = ranked
    .map((m) => byId.get(m.book_id))
    .filter((b): b is IndexBook => b !== undefined)
    .filter((b) => words.every((w) => `${b.title} ${b.author}`.toLowerCase().includes(w)))
    .filter((b) => tags.length === 0 || (tagMap.get(b.id) ?? []).some((t) => tags.includes(t.vibe.toLowerCase())))
    .slice(0, limit);
  if (results.length === 0) return "No books in the library match that search.";

  const header = likeBook
    ? `The ${results.length} books closest to "${likeBook.title}" in subject, mood, and style, closest first.`
    : `The ${results.length} books closest in meaning to "${command.about}", closest first.`;
  return [header, INDEX_LEGEND, ...results.map((b) => formatBookLine(b, tagMap.get(b.id)))].join("\n");
}

export async function executeLibrarySearch(
  supabase: SupabaseClient,
  command: LibrarySearchCommand,
): Promise<string> {
  const limit = Math.min(Math.max(Math.round(command.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const tags = (command.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const statuses = (command.status ?? []).filter((s) => STATUSES.has(s));

  if (command.about?.trim() || command.like_title?.trim()) {
    return searchByMeaning(supabase, command, limit, tags, statuses);
  }

  let query = supabase
    .from("books")
    .select(tags.length > 0 ? `${FIELDS}, book_vibes!inner(vibe)` : FIELDS, { count: "exact" });

  // Every word must appear in the title or the author
  for (const word of queryWords(command.query ?? "")) {
    query = query.or(`title.ilike.%${word}%,author.ilike.%${word}%`);
  }
  if (statuses.length > 0) query = query.in("status", statuses);
  if (command.book_type) query = query.eq("book_type", command.book_type);
  if (tags.length > 0) query = query.in("book_vibes.vibe", tags);

  if (command.sort === "predicted_rating") {
    query = query.order("predicted_rating", { ascending: false, nullsFirst: false }).order("title");
  } else if (command.sort === "recently_finished") {
    query = query.order("date_finished", { ascending: false, nullsFirst: false }).order("title");
  } else if (command.sort === "recently_added") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("title");
  }

  const { data, count, error } = await query.range(0, limit - 1);
  if (error) throw error;
  const books = (data ?? []) as unknown as IndexBook[];
  if (books.length === 0) {
    return "No books in the library match that search.";
  }

  // All of each book's tags, not only the ones the search matched on
  const tagMap = await fetchTags(supabase, books.map((b) => b.id));

  const total = count ?? books.length;
  const header =
    total > books.length
      ? `${total} books match; showing ${books.length}. Narrow the search or raise the limit to see more.`
      : `${total} book${total === 1 ? "" : "s"} match.`;
  return [header, INDEX_LEGEND, ...books.map((b) => formatBookLine(b, tagMap.get(b.id)))].join("\n");
}
