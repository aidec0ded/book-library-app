import { supabase } from "@/lib/supabase";
import { fetchBookIdsByAllTags } from "@/lib/vibes";
import type { BookSummary } from "@/lib/types";

export const GALLERY_PAGE_SIZE = 30;

export async function fetchGalleryBooks(
  bookType: string,
  selectedTags: string[],
  offset: number,
  limit: number = GALLERY_PAGE_SIZE,
): Promise<{ books: BookSummary[]; totalCount: number }> {
  // If tags selected, get matching book IDs via AND intersection
  let tagBookIds: string[] | null = null;
  if (selectedTags.length > 0) {
    tagBookIds = await fetchBookIdsByAllTags(selectedTags);
    if (tagBookIds.length === 0) {
      return { books: [], totalCount: 0 };
    }
  }

  let q = supabase
    .from("books")
    .select("id, title, author, book_type, status, rating, timing_raw, cover_image_url", {
      count: "exact",
    })
    .eq("book_type", bookType)
    .order("title", { ascending: true })
    .range(offset, offset + limit - 1);

  if (tagBookIds) {
    q = q.in("id", tagBookIds);
  }

  const { data, count, error } = await q;
  if (error) throw error;

  return { books: data ?? [], totalCount: count ?? 0 };
}
