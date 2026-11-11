import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBookLine, INDEX_LEGEND, type BookTag, type IndexBook } from "./library-index.js";

/**
 * search_library: the reader's whole library, including the unread books and
 * wishlist the chat prompt leaves out (see buildLibraryIndex). Runs on the reader's
 * own Supabase client, so RLS keeps it to their books.
 */
export interface LibrarySearchCommand {
  query?: string;
  status?: string[];
  tags?: string[];
  book_type?: "fiction" | "nonfiction" | "poetry";
  sort?: "predicted_rating" | "title" | "recently_added";
  limit?: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;
const STATUSES = new Set(["read", "unread", "reading", "unfinished", "wishlist"]);

/** Words of the query, without characters that would break a PostgREST filter. */
function queryWords(query: string): string[] {
  return query
    .replace(/[,()"'\\*%]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);
}

export async function executeLibrarySearch(
  supabase: SupabaseClient,
  command: LibrarySearchCommand,
): Promise<string> {
  const limit = Math.min(Math.max(Math.round(command.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const tags = (command.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const statuses = (command.status ?? []).filter((s) => STATUSES.has(s));

  const fields = "id, title, author, book_type, status, rating, genre, is_favorite, predicted_rating";
  let query = supabase
    .from("books")
    .select(tags.length > 0 ? `${fields}, book_vibes!inner(vibe)` : fields, { count: "exact" });

  // Every word must appear in the title or the author
  for (const word of queryWords(command.query ?? "")) {
    query = query.or(`title.ilike.%${word}%,author.ilike.%${word}%`);
  }
  if (statuses.length > 0) query = query.in("status", statuses);
  if (command.book_type) query = query.eq("book_type", command.book_type);
  if (tags.length > 0) query = query.in("book_vibes.vibe", tags);

  if (command.sort === "predicted_rating") {
    query = query.order("predicted_rating", { ascending: false, nullsFirst: false }).order("title");
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
  const { data: tagRows, error: tagError } = await supabase
    .from("book_vibes")
    .select("book_id, vibe, tag_category")
    .eq("is_canonical", true)
    .in("book_id", books.map((b) => b.id));
  if (tagError) throw tagError;
  const tagMap = new Map<string, BookTag[]>();
  for (const row of tagRows ?? []) {
    tagMap.set(row.book_id, [...(tagMap.get(row.book_id) ?? []), row]);
  }

  const total = count ?? books.length;
  const header =
    total > books.length
      ? `${total} books match; showing ${books.length}. Narrow the search or raise the limit to see more.`
      : `${total} book${total === 1 ? "" : "s"} match.`;
  return [header, INDEX_LEGEND, ...books.map((b) => formatBookLine(b, tagMap.get(b.id)))].join("\n");
}
