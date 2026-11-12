import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authorsCompatible,
  baseTitle,
  compareTitles,
  detectBookType,
  findBestLibraryMatch,
  findMatchingEditions,
  findSameTitleOtherAuthor,
  libraryTitlePattern,
  mapToBookInsert,
  pickBestEdition,
  type ISBNdbBook,
} from "../src/lib/editions.js";
import { isbndbSearch } from "./isbndb.js";

// The app is English-language; the server has no reader's browser to ask
const LANGUAGE = "en";


interface LibraryRow {
  id: string;
  title: string;
  author: string | null;
  status: string | null;
}

async function fetchLibraryCandidates(
  supabase: SupabaseClient,
  title: string,
  select: string,
): Promise<LibraryRow[]> {
  const { data, error } = await supabase
    .from("books")
    .select(select)
    .ilike("title", libraryTitlePattern(title));

  if (error) throw error;
  return (data ?? []) as unknown as LibraryRow[];
}

function withMatchFields(select: string): string {
  return [...new Set(["id", "title", "author", "status", ...select.split(",").map((f) => f.trim())])].join(", ");
}

/**
 * Find a book the reader named, for acting on a book already in their library
 * (rating it, saving an excerpt). The AI sees exact titles in the library index
 * but sometimes passes slight variations, so this matches ignoring punctuation
 * and subtitles, then falls back to any title containing the search term.
 */
export async function findBookByTitle<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  title: string,
  select = "id, title",
): Promise<(T & { id: string; title: string }) | null> {
  const fields = withMatchFields(select);
  const candidates = await fetchLibraryCandidates(supabase, title, fields);
  const match = findBestLibraryMatch(title, null, candidates);
  if (match) return match as unknown as T & { id: string; title: string };

  const escaped = title.replace(/[\\%_]/g, "\\$&");
  const { data: contains, error } = await supabase
    .from("books")
    .select(fields)
    .ilike("title", `%${escaped}%`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return contains as unknown as (T & { id: string; title: string }) | null;
}

// --- ISBNdb lookup ---

/** A search, through the shared client: paced, counted against the quota, and cached. */
async function searchISBNdb(path: string): Promise<ISBNdbBook[]> {
  if (!process.env.ISBNDB_API_KEY) return [];
  return (await isbndbSearch(path))?.books ?? [];
}

/** All listings of a book on ISBNdb, or none if it can't be found or reached. */
async function findEditions(title: string, author?: string): Promise<ISBNdbBook[]> {
  try {
    const encodedTitle = encodeURIComponent(baseTitle(title));
    const byTitle = await searchISBNdb(`/books/${encodedTitle}?page=1&pageSize=100&column=title`);
    const editions = findMatchingEditions(title, author, byTitle);
    if (editions.length > 0) return editions;

    const encodedQuery = encodeURIComponent(author ? `${baseTitle(title)} ${author}` : baseTitle(title));
    const byQuery = await searchISBNdb(`/books/${encodedQuery}?page=1&pageSize=100`);
    return findMatchingEditions(title, author, byQuery);
  } catch (err) {
    // The background enrichment retries books left without details
    console.error(`[book-lookup] ISBNdb lookup failed for "${title}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

// --- Finding or adding a book ---

/** Details for a new book from its likeliest edition, filling gaps from the others. */
function detailsFromEditions(editions: ISBNdbBook[], status: string) {
  const best = pickBestEdition(editions, LANGUAGE);
  if (!best) return null;

  const details = mapToBookInsert(best, status);
  const withSynopsis = editions.find((e) => e.synopsis || e.overview);
  if (!details.summary && withSynopsis) {
    details.summary = mapToBookInsert(withSynopsis, status).summary;
  }
  details.book_type = detectBookType(editions.flatMap((e) => e.subjects ?? []));
  return details;
}

/** Reconnect list items that aren't in the library yet, keeping their focus questions and progress. */
async function linkExternalItems(
  supabase: SupabaseClient,
  bookId: string,
  title: string,
  author?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("list_items")
    .select("id, external_title, external_author")
    .is("book_id", null);

  if (error) throw error;

  for (const item of data ?? []) {
    if (compareTitles(title, item.external_title ?? "") < 2) continue;
    if (authorsCompatible(author, item.external_author) === false) continue;
    // A failure here (the book is already on that list) shouldn't stop the add
    await supabase
      .from("list_items")
      .update({
        book_id: bookId,
        external_title: null,
        external_author: null,
        external_cover_url: null,
        external_isbn: null,
      })
      .eq("id", item.id);
  }
}

export interface FoundBook {
  id: string;
  title: string;
  status: string | null;
  created: boolean;
  /** Set when a new book shares its title with a library book by another author. */
  similar?: { title: string; author: string | null };
}

/**
 * Find a book by title and author, or add it if the reader doesn't have it.
 * New books get their details from ISBNdb. An edition's ISBN is also checked
 * against the library, which catches owned copies stored under another title.
 */
export async function findOrCreateBook(
  supabase: SupabaseClient,
  title: string,
  author?: string,
  status = "wishlist",
): Promise<FoundBook> {
  const candidates = await fetchLibraryCandidates(supabase, title, "id, title, author, status");
  const existing = findBestLibraryMatch(title, author, candidates);
  if (existing) {
    return { id: existing.id, title: existing.title, status: existing.status, created: false };
  }

  const editions = await findEditions(title, author);

  const isbns = editions.flatMap((e) => [e.isbn13, e.isbn]).filter((i): i is string => !!i);
  if (isbns.length > 0) {
    const { data: sameIsbn, error: isbnError } = await supabase
      .from("books")
      .select("id, title, status")
      .in("isbn", isbns)
      .limit(1);
    if (isbnError) throw isbnError;
    const owned = sameIsbn?.[0];
    if (owned) return { id: owned.id, title: owned.title, status: owned.status, created: false };
  }

  // With no details found, isbndb_enriched_at stays null so the background enrichment tries again
  const details = detailsFromEditions(editions, status);
  const { data, error } = await supabase
    .from("books")
    .insert({
      ...details,
      title,
      author: author || details?.author || "Unknown",
      status,
      is_favorite: false,
      is_up_next: false,
      // The AI added it: in chat, during onboarding, or to a syllabus or reading path
      added_via: "chat",
    })
    .select("id, title")
    .single();

  if (error) throw error;

  await linkExternalItems(supabase, data.id, title, author);

  const similar = findSameTitleOtherAuthor(title, author, candidates);
  return {
    id: data.id,
    title: data.title,
    status,
    created: true,
    ...(similar && { similar: { title: similar.title, author: similar.author } }),
  };
}

/** Tool-result text about same-titled library books, so the AI can flag a possible duplicate. */
export function describeSimilarBooks(books: FoundBook[]): string {
  const notes = books
    .filter((b) => b.similar)
    .map(
      (b) =>
        `'${b.title}' was added as new, but the library has '${b.similar!.title}' by ${b.similar!.author ?? "Unknown"}.`,
    );
  if (notes.length === 0) return "";
  return `\nPossible duplicates: ${notes.join(" ")} If it's the same work, tell the reader. Using the library's exact title with no author links to their copy.`;
}
