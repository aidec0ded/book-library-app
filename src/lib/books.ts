import { supabase } from "@/lib/supabase";
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
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("books")
    .update(fields)
    .eq("id", bookId);
  if (error) throw error;
}
