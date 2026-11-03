import type { SupabaseClient } from "@supabase/supabase-js";
import { describeSimilarBooks, findBookByTitle, findOrCreateBook } from "./book-lookup.js";
import { isIsoDate, readingDatesError, type ReadingDates } from "../src/lib/reading-dates.js";

export interface BookCommand {
  action: "update_status" | "update_rating" | "toggle_favorite" | "delete" | "add";
  book_title: string;
  author?: string;
  status?: string;
  rating?: number;
  date?: string;
}

const VALID_STATUSES = ["unread", "reading", "read", "unfinished", "wishlist"];

/**
 * The date changes for a date the reader gave. Unlike the book page, the chat only sets dates
 * it was told about: "I read that years ago" shouldn't record today as the finish date.
 */
function datesFromReader(
  status: string,
  date: string,
  current: ReadingDates,
  today: string,
): { changes: Partial<ReadingDates> } | { problem: string } {
  if (!isIsoDate(date)) return { problem: `Invalid date '${date}'. Use YYYY-MM-DD.` };

  let changes: Partial<ReadingDates>;
  if (status === "reading") {
    // Starting after an earlier finish is a reread, so that finish no longer applies
    changes =
      current.date_finished && current.date_finished < date
        ? { date_started: date, date_finished: null }
        : { date_started: date };
  } else if (status === "read" || status === "unfinished") {
    changes = { date_finished: date };
  } else {
    return { problem: `A book with status '${status}' doesn't have reading dates.` };
  }

  const problem = readingDatesError({ ...current, ...changes }, today);
  return problem ? { problem } : { changes };
}

export async function executeBookCommand(
  supabase: SupabaseClient,
  command: BookCommand,
  today: string,
): Promise<string> {
  if (!command.book_title) {
    throw new Error("book_title is required");
  }

  // "add" action doesn't require an existing book
  if (command.action === "add") {
    const status = command.status && VALID_STATUSES.includes(command.status) ? command.status : "read";
    const added = await findOrCreateBook(supabase, command.book_title, command.author, status);
    if (!added.created) {
      return `'${added.title}' is already in the library with status '${added.status}'.`;
    }
    let dateNote = "";
    if (command.date) {
      const dates = datesFromReader(status, command.date, { date_started: null, date_finished: null }, today);
      if ("problem" in dates) {
        dateNote = ` The date wasn't saved: ${dates.problem}`;
      } else {
        const { error } = await supabase.from("books").update(dates.changes).eq("id", added.id);
        if (error) throw error;
      }
    }
    return `Added '${added.title}' to the library with status '${status}'.${dateNote}${describeSimilarBooks([added])}`;
  }

  // Look up book by title with fuzzy fallback
  const book = await findBookByTitle<
    { status: string | null; rating: number | null; is_favorite: boolean } & ReadingDates
  >(
    supabase,
    command.book_title,
    "id, title, status, rating, is_favorite, date_started, date_finished",
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

      const dates = command.date
        ? datesFromReader(newStatus, command.date, book, today)
        : { changes: {} };
      if ("problem" in dates) {
        return `No change made to '${book.title}': ${dates.problem}`;
      }

      const dateNote = command.date ? ` Date recorded: ${command.date}.` : "";

      if (book.status === newStatus && !command.date) {
        return `'${book.title}' already has status '${newStatus}'.`;
      }

      const { error } = await supabase
        .from("books")
        .update({ status: newStatus, ...dates.changes })
        .eq("id", book.id);

      if (error) throw error;

      if (book.status === newStatus) {
        return `'${book.title}' already has status '${newStatus}'.${dateNote}`;
      }
      return `Updated '${book.title}' status from '${book.status ?? "unset"}' to '${newStatus}'.${dateNote}`;
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
