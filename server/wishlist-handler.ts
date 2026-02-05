import type { SupabaseClient } from "@supabase/supabase-js";

export interface WishlistCommand {
  action: "add" | "view" | "remove";
  title?: string;
  author?: string;
}

export async function executeWishlistCommand(
  supabase: SupabaseClient,
  command: WishlistCommand,
): Promise<string> {
  switch (command.action) {
    case "add": {
      if (!command.title) {
        throw new Error("'add' requires a title");
      }

      // Search for existing book by title
      const { data: existing, error: searchError } = await supabase
        .from("books")
        .select("id, title, status")
        .ilike("title", command.title)
        .limit(1)
        .maybeSingle();

      if (searchError) throw searchError;

      if (existing) {
        if (existing.status === "wishlist") {
          return `'${existing.title}' is already on your wishlist.`;
        }
        return `'${existing.title}' is already in your library with status '${existing.status}'.`;
      }

      // Insert new book as wishlist
      const { error: insertError } = await supabase.from("books").insert({
        title: command.title,
        author: command.author ?? "Unknown",
        status: "wishlist",
        is_favorite: false,
        is_up_next: false,
      });

      if (insertError) throw insertError;

      return `Added '${command.title}' to your wishlist.`;
    }

    case "view": {
      const { data: books, error } = await supabase
        .from("books")
        .select("title, author")
        .eq("status", "wishlist")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!books || books.length === 0) {
        return "Your wishlist is empty.";
      }

      const lines = books.map(
        (b) => `- ${b.title} by ${b.author}`,
      );

      return `Your wishlist (${books.length} book${books.length === 1 ? "" : "s"}):\n${lines.join("\n")}`;
    }

    case "remove": {
      if (!command.title) {
        throw new Error("'remove' requires a title");
      }

      const { data: book, error: findError } = await supabase
        .from("books")
        .select("id, title, status")
        .ilike("title", command.title)
        .limit(1)
        .maybeSingle();

      if (findError) throw findError;

      if (!book) {
        return `Could not find '${command.title}' in your library.`;
      }

      if (book.status !== "wishlist") {
        return `'${book.title}' has status '${book.status}', not 'wishlist'. No change made.`;
      }

      const { error: updateError } = await supabase
        .from("books")
        .update({ status: "unread" })
        .eq("id", book.id);

      if (updateError) throw updateError;

      return `Removed '${book.title}' from wishlist (status changed to 'unread').`;
    }

    default:
      throw new Error(
        `Unknown wishlist action: ${(command as WishlistCommand).action}`,
      );
  }
}
