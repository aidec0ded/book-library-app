import { supabase } from "@/lib/supabase";
import { authorSearchPattern, isSameAuthor, parseAuthorNames } from "@/lib/editions";
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
