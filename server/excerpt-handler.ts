import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle } from "./book-lookup.js";
import type { LinkedBook } from "./book-context.js";

export interface ExcerptCommand {
  action: "save" | "view";
  book_title?: string;
  content?: string;
}

/** The conversation's own book comes first, so a shared title can't send it to the wrong one. */
async function resolveBook(
  supabase: SupabaseClient,
  title: string | undefined,
  linkedBook: LinkedBook | null,
): Promise<LinkedBook | null> {
  if (linkedBook && (!title || title.trim().toLowerCase() === linkedBook.title.toLowerCase())) {
    return linkedBook;
  }
  if (!title) throw new Error("book_title is required");
  return findBookByTitle(supabase, title);
}

export async function executeExcerptCommand(
  supabase: SupabaseClient,
  command: ExcerptCommand,
  currentConversationId: string | null,
  linkedBook: LinkedBook | null = null,
): Promise<string> {
  switch (command.action) {
    case "save": {
      if (!command.content) {
        throw new Error("'save' requires content");
      }

      const book = await resolveBook(supabase, command.book_title, linkedBook);

      if (!book) {
        return `Could not find '${command.book_title}' in the library, so nothing was saved. Tell the reader.`;
      }

      const { error: insertError } = await supabase
        .from("book_excerpts")
        .insert({
          book_id: book.id,
          conversation_id: currentConversationId,
          content: command.content,
        });

      if (insertError) throw insertError;

      return `Saved excerpt to '${book.title}'.`;
    }

    case "view": {
      const book = await resolveBook(supabase, command.book_title, linkedBook);

      if (!book) {
        return `Could not find '${command.book_title}' in the library.`;
      }

      const { data: excerpts, error: fetchError } = await supabase
        .from("book_excerpts")
        .select("content, created_at")
        .eq("book_id", book.id)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      if (!excerpts || excerpts.length === 0) {
        return `No excerpts saved for '${book.title}' yet.`;
      }

      const lines = excerpts.map(
        (e, i) => `${i + 1}. ${e.content}`,
      );

      return `Excerpts for '${book.title}' (${excerpts.length}):\n${lines.join("\n")}`;
    }

    default:
      throw new Error(
        `Unknown excerpt action: ${(command as ExcerptCommand).action}`,
      );
  }
}
