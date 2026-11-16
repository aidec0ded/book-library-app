import { supabase } from "@/lib/supabase";
import type { BookExcerpt } from "@/lib/types";

export async function fetchExcerptsForBook(bookId: string): Promise<BookExcerpt[]> {
  const { data, error } = await supabase
    .from("book_excerpts")
    .select("*")
    .eq("book_id", bookId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function saveExcerpt(excerpt: {
  bookId: string;
  conversationId: string | null;
  content: string;
}): Promise<void> {
  const { error } = await supabase.from("book_excerpts").insert({
    book_id: excerpt.bookId,
    conversation_id: excerpt.conversationId,
    content: excerpt.content,
  });

  if (error) throw error;
}

/**
 * Hidden rather than removed, so the review step knows the reader didn't want it and doesn't
 * save it again. Deleting the book or the account removes it for good.
 */
export async function deleteExcerpt(excerptId: string): Promise<void> {
  const { error } = await supabase
    .from("book_excerpts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", excerptId);

  if (error) throw error;
}
