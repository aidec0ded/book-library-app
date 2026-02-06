import { supabase } from "@/lib/supabase";
import type { Book } from "@/lib/types";

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
