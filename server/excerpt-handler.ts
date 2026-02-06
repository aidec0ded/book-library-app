import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExcerptCommand {
  action: "save" | "view";
  book_title: string;
  content?: string;
}

export async function executeExcerptCommand(
  supabase: SupabaseClient,
  command: ExcerptCommand,
  currentConversationId: string | null,
): Promise<string> {
  switch (command.action) {
    case "save": {
      if (!command.book_title) {
        throw new Error("'save' requires a book_title");
      }
      if (!command.content) {
        throw new Error("'save' requires content");
      }

      const { data: book, error: findError } = await supabase
        .from("books")
        .select("id, title")
        .ilike("title", command.book_title)
        .limit(1)
        .maybeSingle();

      if (findError) throw findError;

      if (!book) {
        return `Could not find '${command.book_title}' in the library.`;
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
      if (!command.book_title) {
        throw new Error("'view' requires a book_title");
      }

      const { data: book, error: findError } = await supabase
        .from("books")
        .select("id, title")
        .ilike("title", command.book_title)
        .limit(1)
        .maybeSingle();

      if (findError) throw findError;

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
