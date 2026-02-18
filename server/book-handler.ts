import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle } from "./book-lookup.js";

export interface BookCommand {
  action: "update_status" | "update_rating" | "toggle_favorite" | "delete" | "add";
  book_title: string;
  author?: string;
  status?: string;
  rating?: number;
}

const VALID_STATUSES = ["unread", "reading", "read", "unfinished", "wishlist"];

export async function executeBookCommand(
  supabase: SupabaseClient,
  command: BookCommand,
): Promise<string> {
  if (!command.book_title) {
    throw new Error("book_title is required");
  }

  // "add" action doesn't require an existing book
  if (command.action === "add") {
    // Check if already in library
    const existing = await findBookByTitle<{ status: string | null }>(
      supabase,
      command.book_title,
      "id, title, status",
    );
    if (existing) {
      return `'${existing.title}' is already in the library with status '${existing.status}'.`;
    }

    const status = command.status && VALID_STATUSES.includes(command.status) ? command.status : "read";
    const { error } = await supabase.from("books").insert({
      title: command.book_title,
      author: command.author ?? "Unknown",
      status,
      is_favorite: false,
      is_up_next: false,
    });

    if (error) throw error;
    return `Added '${command.book_title}' to the library with status '${status}'.`;
  }

  // Look up book by title with fuzzy fallback
  const book = await findBookByTitle<{ status: string | null; rating: number | null; is_favorite: boolean }>(
    supabase,
    command.book_title,
    "id, title, status, rating, is_favorite",
  );

  if (!book) {
    return `Could not find '${command.book_title}' in the library.`;
  }

  switch (command.action) {
    case "update_status": {
      if (!command.status) {
        throw new Error("'update_status' requires a status value");
      }

      const newStatus = command.status.toLowerCase().trim();
      if (!VALID_STATUSES.includes(newStatus)) {
        return `Invalid status '${command.status}'. Valid options: ${VALID_STATUSES.join(", ")}`;
      }

      if (book.status === newStatus) {
        return `'${book.title}' already has status '${newStatus}'.`;
      }

      const { error } = await supabase
        .from("books")
        .update({ status: newStatus })
        .eq("id", book.id);

      if (error) throw error;

      return `Updated '${book.title}' status from '${book.status ?? "unset"}' to '${newStatus}'.`;
    }

    case "update_rating": {
      if (command.rating == null) {
        throw new Error("'update_rating' requires a rating value");
      }

      const rating = command.rating;

      // Validate: 0 means unrated, otherwise 0.25–5.0 in 0.25 increments
      if (rating === 0) {
        const { error } = await supabase
          .from("books")
          .update({ rating: null })
          .eq("id", book.id);

        if (error) throw error;
        return `Cleared rating for '${book.title}'.`;
      }

      if (rating < 0.25 || rating > 5 || (rating * 4) % 1 !== 0) {
        return `Invalid rating ${rating}. Must be 0 (unrated) or 0.25–5.0 in 0.25 increments.`;
      }

      const { error } = await supabase
        .from("books")
        .update({ rating })
        .eq("id", book.id);

      if (error) throw error;

      const prev = book.rating != null ? `from ${book.rating}` : "(was unrated)";
      return `Rated '${book.title}' ${rating}/5 ${prev}.`;
    }

    case "toggle_favorite": {
      const newValue = !book.is_favorite;

      const { error } = await supabase
        .from("books")
        .update({ is_favorite: newValue })
        .eq("id", book.id);

      if (error) throw error;

      return newValue
        ? `Marked '${book.title}' as a favorite.`
        : `Removed '${book.title}' from favorites.`;
    }

    case "delete": {
      const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", book.id);

      if (error) throw error;

      return `Removed '${book.title}' from the library.`;
    }

    default:
      throw new Error(
        `Unknown book action: ${(command as BookCommand).action}`,
      );
  }
}
