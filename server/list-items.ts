import type { SupabaseClient } from "@supabase/supabase-js";
import { authorsCompatible, compareTitles } from "../src/lib/editions.js";

/** A syllabus or reading path entry, whether or not its book is in the library. */
export interface ListEntry {
  id: string;
  position: number;
  book_id: string | null;
  title: string;
  author: string | null;
  rationale: string | null;
  path_progress: string | null;
  seminar_content: unknown;
}

interface ListItemRow {
  id: string;
  position: number;
  book_id: string | null;
  external_title: string | null;
  external_author: string | null;
  rationale: string | null;
  path_progress: string | null;
  seminar_content: unknown;
  book: { title: string; author: string | null } | null;
}

export async function fetchListEntries(
  supabase: SupabaseClient,
  listId: string,
): Promise<ListEntry[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select(
      "id, position, book_id, external_title, external_author, rationale, path_progress, seminar_content, book:books(title, author)",
    )
    .eq("list_id", listId)
    .order("position");

  if (error) throw error;

  return ((data ?? []) as unknown as ListItemRow[]).map((row) => ({
    id: row.id,
    position: row.position,
    book_id: row.book_id,
    title: row.book?.title ?? row.external_title ?? "Untitled",
    author: row.book?.author ?? row.external_author,
    rationale: row.rationale,
    path_progress: row.path_progress,
    seminar_content: row.seminar_content,
  }));
}

/** Find the entry for a title, ignoring punctuation and subtitles. Errors name the choices so the AI can correct itself. */
export function findEntry(entries: ListEntry[], title: string, listName: string): ListEntry {
  let best: ListEntry[] = [];
  let bestRank = 0;
  for (const entry of entries) {
    const rank = compareTitles(title, entry.title);
    if (rank === 0) continue;
    if (rank > bestRank) {
      best = [entry];
      bestRank = rank;
    } else if (rank === bestRank) {
      best.push(entry);
    }
  }

  const [match] = best;
  if (match && best.length === 1) return match;

  const names = (match ? best : entries).map((e) => `'${e.title}'`).join(", ");
  throw new Error(
    match
      ? `'${title}' matches more than one book in '${listName}': ${names}. Use the full title.`
      : `No book matching '${title}' in '${listName}'. It contains: ${names || "nothing yet"}.`,
  );
}

/** Save an order, writing only the positions that changed. */
export async function saveOrder(supabase: SupabaseClient, entries: ListEntry[]): Promise<void> {
  const changed = entries
    .map((entry, i) => ({ id: entry.id, from: entry.position, to: i + 1 }))
    .filter((c) => c.from !== c.to);

  const results = await Promise.all(
    changed.map((c) => supabase.from("list_items").update({ position: c.to }).eq("id", c.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export function describeOrder(entries: ListEntry[]): string {
  return entries.map((e, i) => `${i + 1}. ${e.title}`).join("\n");
}

/**
 * Reorder a list: either a new order of titles, where any left out keep their
 * relative order after those named, or one book moved to a position.
 */
export async function reorderList(
  supabase: SupabaseClient,
  listId: string,
  listName: string,
  options: { ordered_titles?: string[]; book_title?: string; position?: number },
): Promise<string> {
  const entries = await fetchListEntries(supabase, listId);
  let reordered: ListEntry[];

  if (options.ordered_titles && options.ordered_titles.length > 0) {
    const named = options.ordered_titles.map((title) => findEntry(entries, title, listName));
    if (new Set(named.map((e) => e.id)).size !== named.length) {
      throw new Error("ordered_titles names the same book more than once.");
    }
    const namedIds = new Set(named.map((e) => e.id));
    reordered = [...named, ...entries.filter((e) => !namedIds.has(e.id))];
  } else if (options.book_title && options.position !== undefined) {
    const entry = findEntry(entries, options.book_title, listName);
    reordered = entries.filter((e) => e.id !== entry.id);
    const index = Math.max(0, Math.min(Math.trunc(options.position) - 1, reordered.length));
    reordered.splice(index, 0, entry);
  } else {
    throw new Error("'reorder' requires ordered_titles, or book_title and position.");
  }

  await saveOrder(supabase, reordered);
  return `New order of '${listName}':\n${describeOrder(reordered)}`;
}

/** Move newly added entries to a position, and close any gaps in the numbering. */
export async function placeNewEntries(
  supabase: SupabaseClient,
  listId: string,
  newIds: string[],
  position?: number,
): Promise<void> {
  const entries = await fetchListEntries(supabase, listId);
  const added = entries.filter((e) => newIds.includes(e.id));
  const rest = entries.filter((e) => !newIds.includes(e.id));
  const index =
    position === undefined
      ? rest.length
      : Math.max(0, Math.min(Math.trunc(position) - 1, rest.length));
  rest.splice(index, 0, ...added);
  await saveOrder(supabase, rest);
}

/** Remove books from a list by title, keeping them in the library. */
export async function removeListBooks(
  supabase: SupabaseClient,
  listId: string,
  listName: string,
  titles: string[],
): Promise<{ removed: ListEntry[]; notFound: string[] }> {
  const entries = await fetchListEntries(supabase, listId);
  const removed: ListEntry[] = [];
  const notFound: string[] = [];

  for (const title of titles) {
    try {
      removed.push(findEntry(entries, title, listName));
    } catch {
      notFound.push(title);
    }
  }

  const removedIds = [...new Set(removed.map((e) => e.id))];
  if (removedIds.length > 0) {
    const { error } = await supabase.from("list_items").delete().in("id", removedIds);
    if (error) throw error;
  }

  await saveOrder(
    supabase,
    entries.filter((e) => !removedIds.includes(e.id)),
  );
  return { removed, notFound };
}

/** Whether a same-titled entry by this author is already in the list, e.g. kept after its book left the library. */
export function hasEntryFor(
  entries: ListEntry[],
  title: string,
  author?: string | null,
): boolean {
  return entries.some(
    (e) => compareTitles(title, e.title) >= 2 && authorsCompatible(author, e.author) !== false,
  );
}
