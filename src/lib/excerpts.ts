import { supabase } from "@/lib/supabase";
import type { BookExcerpt } from "@/lib/types";

export async function fetchExcerptsForBook(bookId: string): Promise<BookExcerpt[]> {
  const { data, error } = await supabase
    .from("book_excerpts")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function deleteExcerpt(excerptId: string): Promise<void> {
  const { error } = await supabase
    .from("book_excerpts")
    .delete()
    .eq("id", excerptId);

  if (error) throw error;
}
