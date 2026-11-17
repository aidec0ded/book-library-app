import { supabase } from "@/lib/supabase";
import { authorSearchPattern, isSameAuthor, normalizeWorkTitle, parseAuthorNames } from "@/lib/editions";
import type { Book } from "@/lib/types";

/** Format a rating for display: 4.0 → "4.0", 4.5 → "4.5", 4.25 → "4.25", 4.75 → "4.75" */
export function formatRating(v: number): string {
  return v % 0.5 === 0 ? v.toFixed(1) : v.toFixed(2);
}

export async function updateBook(
  bookId: string,
  fields: Partial<
    Pick<
      Book,
      | "status"
      | "rating"
      | "is_favorite"
      | "notes"
      | "cover_image_url"
      | "isbn"
      | "book_type"
      | "publisher"
      | "publication_year"
      | "page_count"
      | "format"
      | "summary"
      | "isbndb_enriched_at"
      | "date_started"
      | "date_finished"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("books")
    .update(fields)
    .eq("id", bookId);
  if (error) throw error;
}

export async function deleteBook(bookId: string): Promise<void> {
  const { error } = await supabase
    .from("books")
    .delete()
    .eq("id", bookId);
  if (error) throw error;
}

export interface AuthorBook {
  id: string;
  title: string;
  author: string;
  status: string | null;
  rating: number | null;
  predicted_rating: number | null;
  cover_image_url: string | null;
}

/** Every book in the library by this person, including ones they co-wrote. */
export async function fetchBooksByAuthor(name: string): Promise<AuthorBook[]> {
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, status, rating, predicted_rating, cover_image_url")
    .ilike("author", authorSearchPattern(name));
  if (error) throw error;
  return (data ?? []).filter((book) =>
    parseAuthorNames(book.author).some((other) => isSameAuthor(other, name)),
  );
}

export function authorLibraryPath(name: string): string {
  return `/library?author=${encodeURIComponent(name)}`;
}

export interface LibraryTitle {
  id: string;
  title: string;
}

const TITLE_PAGE_SIZE = 1000;

/** Every book's title, for linking titles in chat replies. Supabase returns at most 1,000 rows a request. */
export async function fetchLibraryTitles(): Promise<LibraryTitle[]> {
  const titles: LibraryTitle[] = [];
  for (let from = 0; ; from += TITLE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title")
      .order("id")
      .range(from, from + TITLE_PAGE_SIZE - 1);
    if (error) throw error;
    titles.push(...(data ?? []));
    if (!data || data.length < TITLE_PAGE_SIZE) return titles;
  }
}

export interface SimilarBook extends AuthorBook {
  similarity: number;
}

// Below this, a "match" is mostly noise (in November 2026, a consciousness book matched a
// self-help collection at 0.51); a short row is better than a misleading one
const MIN_SIMILARITY = 0.55;

/**
 * The reader's books closest in meaning to this one (from their titles, authors, genres,
 * and summaries, through the shared book embeddings), with the given statuses. Leaves out
 * other books by the same author, which "Also by" shows, and other editions of the same
 * book. A database query against embeddings already made, so it costs no AI call.
 */
export async function fetchSimilarBooks(
  book: { id: string; title: string; author: string },
  statuses: string[],
  count: number,
): Promise<SimilarBook[]> {
  const { data: matches, error } = await supabase.rpc("match_books", {
    like_book_id: book.id,
    statuses,
    match_count: count * 3,
  });
  if (error) throw error;
  const ranked = ((matches ?? []) as { book_id: string; similarity: number }[]).filter(
    (m) => m.similarity >= MIN_SIMILARITY,
  );
  if (ranked.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("books")
    .select("id, title, author, status, rating, predicted_rating, cover_image_url")
    .in(
      "id",
      ranked.map((m) => m.book_id),
    );
  if (rowsError) throw rowsError;

  const byId = new Map((rows ?? []).map((row) => [row.id as string, row as AuthorBook]));
  const authors = parseAuthorNames(book.author);
  const work = normalizeWorkTitle(book.title);
  const seenWorks = new Set([work]);
  const similar: SimilarBook[] = [];
  for (const match of ranked) {
    const found = byId.get(match.book_id);
    if (!found) continue;
    if (parseAuthorNames(found.author).some((a) => authors.some((b) => isSameAuthor(a, b)))) continue;
    const foundWork = normalizeWorkTitle(found.title);
    if (seenWorks.has(foundWork)) continue;
    seenWorks.add(foundWork);
    similar.push({ ...found, similarity: match.similarity });
    if (similar.length === count) break;
  }
  return similar;
}
