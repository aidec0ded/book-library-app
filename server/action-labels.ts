import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle } from "./book-lookup.js";
import type { LinkedBook } from "./book-context.js";

/** What the reader sees in the thread for one change the companion made. */
export interface ActionLabel {
  /** Plain sentence, with book and list names in *italics* */
  label: string;
  /** Where the change can be seen, when there's somewhere to go */
  href?: string;
}

const STATUS_WORDS: Record<string, string> = {
  read: "read",
  reading: "reading",
  unread: "unread",
  unfinished: "unfinished",
};

const PROGRESS_WORDS: Record<string, string> = {
  not_started: "not started",
  reading: "reading",
  completed: "finished",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown, noun: string): string {
  const n = Array.isArray(value) ? value.length : 0;
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

async function bookHref(supabase: SupabaseClient, title: string): Promise<string | undefined> {
  if (!title) return undefined;
  const book = await findBookByTitle(supabase, title).catch(() => null);
  return book ? `/books/${book.id}` : undefined;
}

/** Syllabi and reading paths share a page. */
async function listHref(supabase: SupabaseClient, name: string): Promise<string | undefined> {
  if (!name) return undefined;
  const { data } = await supabase.from("lists").select("id").ilike("name", name).limit(1).maybeSingle();
  return data ? `/syllabi/${data.id}` : undefined;
}

/**
 * The reader-facing line for a change, or null for one not worth showing: memory notes are
 * the companion's own, and lookups change nothing. Built from what the tool was asked to do,
 * since the tool's result is written for the AI. Never throws: a missing link isn't a failure.
 */
export async function describeAction(
  supabase: SupabaseClient,
  tool: string,
  input: unknown,
  linkedBook: LinkedBook | null,
): Promise<ActionLabel | null> {
  const fields = (input ?? {}) as Record<string, unknown>;
  const action = text(fields.action);

  if (tool === "manage_book") {
    const title = text(fields.book_title);
    const status = text(fields.status);
    const book = `*${title}*`;
    switch (action) {
      case "add":
        return {
          label: status === "wishlist" ? `Added ${book} to your wishlist` : `Added ${book} to your library`,
          href: await bookHref(supabase, title),
        };
      case "update_status":
        return {
          label: status === "wishlist"
            ? `Moved ${book} to your wishlist`
            : `Marked ${book} as ${STATUS_WORDS[status] ?? status}`,
          href: await bookHref(supabase, title),
        };
      case "update_rating": {
        const rating = Number(fields.rating);
        return {
          label: rating > 0 ? `Rated ${book} ${rating}★` : `Cleared your rating for ${book}`,
          href: await bookHref(supabase, title),
        };
      }
      case "toggle_favorite":
        return { label: `Changed whether ${book} is a favorite`, href: await bookHref(supabase, title) };
      case "delete":
        return { label: `Removed ${book} from your library` };
      default:
        return null;
    }
  }

  if (tool === "manage_wishlist") {
    const title = text(fields.title);
    if (action === "add") {
      return { label: `Added *${title}* to your wishlist`, href: await bookHref(supabase, title) };
    }
    if (action === "remove") {
      return { label: `Took *${title}* off your wishlist`, href: await bookHref(supabase, title) };
    }
    return null;
  }

  if (tool === "manage_syllabi") {
    const name = text(fields.new_name) || text(fields.list_name);
    const list = `*${name}*`;
    const href = action === "delete" ? undefined : await listHref(supabase, name);
    switch (action) {
      case "create":
        return { label: `Created the syllabus ${list}`, href };
      case "add_books":
        return { label: `Added ${count(fields.books, "book")} to ${list}`, href };
      case "remove_books":
        return { label: `Removed ${count(fields.books, "book")} from ${list}`, href };
      case "reorder":
        return { label: `Reordered ${list}`, href };
      case "update_rationale":
        return { label: `Updated why *${text(fields.book_title)}* is on ${list}`, href };
      case "update_syllabus":
        return { label: `Updated ${list}`, href };
      case "delete":
        return { label: `Deleted the syllabus ${list}` };
      default:
        return null;
    }
  }

  if (tool === "manage_reading_paths") {
    const name = text(fields.new_name) || text(fields.path_name);
    const path = `*${name}*`;
    const title = text(fields.book_title);
    const href = action === "delete_path" ? undefined : await listHref(supabase, name);
    switch (action) {
      case "create_path":
        return { label: `Created the reading path ${path}`, href };
      case "add_path_books":
        return { label: `Added ${count(fields.books, "book")} to ${path}`, href };
      case "remove_path_books":
        return { label: `Removed ${count(fields.books, "book")} from ${path}`, href };
      case "update_progress":
        return {
          label: `Marked *${title}* as ${PROGRESS_WORDS[text(fields.progress)] ?? text(fields.progress)} on ${path}`,
          href,
        };
      case "update_seminar_content":
        return { label: `Updated the notes for *${title}* on ${path}`, href };
      case "reorder":
        return { label: `Reordered ${path}`, href };
      case "update_path":
        return { label: `Updated ${path}`, href };
      case "delete_path":
        return { label: `Deleted the reading path ${path}` };
      default:
        return null;
    }
  }

  if (tool === "save_excerpt" && action === "save") {
    const title = text(fields.book_title) || linkedBook?.title || "";
    if (!title) return { label: "Saved an excerpt" };
    const href = !text(fields.book_title) && linkedBook ? `/books/${linkedBook.id}` : await bookHref(supabase, title);
    return { label: `Saved an excerpt to *${title}*`, href };
  }

  return null;
}
