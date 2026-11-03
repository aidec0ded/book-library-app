import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baseTitle,
  detectBookType,
  findBestLibraryMatch,
  findMatchingEditions,
  findSameTitleOtherAuthor,
  libraryTitlePattern,
  mapToBookInsert,
  pickBestEdition,
  type ISBNdbBook,
} from "../src/lib/editions.js";

// The app is English-language; the server has no reader's browser to ask
const LANGUAGE = "en";

const ISBNDB_BASE_URL = "https://api2.isbndb.com";
const ISBNDB_TIMEOUT_MS = 10_000;
const ISBNDB_MIN_GAP_MS = 1100; // ISBNdb allows about one request per second

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

let lastRequest: Promise<unknown> = Promise.resolve();

// Runs requests one at a time with a gap, since a reading path can add several books
function throttled<T>(request: () => Promise<T>): Promise<T> {
  const result = lastRequest.then(request);
  lastRequest = result
    .catch(() => undefined)
    .then(() => new Promise((resolve) => setTimeout(resolve, ISBNDB_MIN_GAP_MS)));
  return result;
}

async function searchISBNdb(path: string): Promise<ISBNdbBook[]> {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(`${ISBNDB_BASE_URL}${path}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(ISBNDB_TIMEOUT_MS),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ISBNdb HTTP ${res.status}`);
  const data = (await res.json()) as { books?: ISBNdbBook[] };
  return data.books ?? [];
}

/** All listings of a book on ISBNdb, or none if it can't be found or reached. */
async function findEditions(title: string, author?: string): Promise<ISBNdbBook[]> {
  try {
    const encodedTitle = encodeURIComponent(baseTitle(title));
    const byTitle = await throttled(() =>
      searchISBNdb(`/books/${encodedTitle}?page=1&pageSize=100&column=title`),
    );
    const editions = findMatchingEditions(title, author, byTitle);
    if (editions.length > 0) return editions;

    const encodedQuery = encodeURIComponent(author ? `${baseTitle(title)} ${author}` : baseTitle(title));
    const byQuery = await throttled(() => searchISBNdb(`/books/${encodedQuery}?page=1&pageSize=100`));
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
    })
    .select("id, title")
    .single();

  if (error) throw error;

  // Auto-link any existing external list items matching this title
  await supabase
    .from("list_items")
    .update({ book_id: data.id, external_title: null, external_author: null })
    .is("book_id", null)
    .ilike("external_title", title);

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
