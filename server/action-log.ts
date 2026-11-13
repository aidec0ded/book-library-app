/**
 * A short record of what the companion did with its tools in a reply, saved with the
 * reply (messages.actions, migration 037). Only the reply's text is otherwise kept, so
 * without it the companion wouldn't know in a later turn that it had, say, added a
 * book to the wishlist. Searches and views change nothing and aren't recorded.
 *
 * The record goes back to the AI as an <actions> note at the end of the reply it
 * belongs to (see withActions). Readers never see it.
 */

export interface ActionRecord {
  tool: string;
  action: string | null;
  /** The tool's result, first line only */
  result: string;
  failed?: boolean;
}

/** Tool actions that only look things up. */
const READ_ONLY: Record<string, true | string[]> = {
  search_library: true,
  search_releases: true,
  manage_syllabi: ["view"],
  manage_reading_paths: ["view_path", "get_seminar_content"],
  manage_wishlist: ["view"],
  save_excerpt: ["view"],
};

/** Tools whose changes can add, change, or remove books in the library. */
const CHANGES_BOOKS = new Set(["manage_book", "manage_wishlist", "manage_syllabi", "manage_reading_paths"]);

const MAX_RESULT_CHARS = 200;

function firstLine(text: string): string {
  const line = text.split("\n")[0].trim();
  return line.length > MAX_RESULT_CHARS ? `${line.slice(0, MAX_RESULT_CHARS - 1)}…` : line;
}

/** The record of one tool call, or null for a call that only looked something up. */
export function actionRecord(
  tool: string,
  input: unknown,
  result: string,
  failed: boolean,
): ActionRecord | null {
  const fields = (input ?? {}) as Record<string, unknown>;
  const action = typeof fields.action === "string" ? fields.action : typeof fields.command === "string" ? fields.command : null;
  const readOnly = READ_ONLY[tool];
  if (readOnly === true || (readOnly && action && readOnly.includes(action))) return null;
  return { tool, action, result: firstLine(result), ...(failed && { failed: true }) };
}

/** Whether a tool call may have changed the reader's books, so the library index is stale. */
export function changesBooks(record: ActionRecord | null): boolean {
  return record != null && !record.failed && CHANGES_BOOKS.has(record.tool);
}

/** A reply's text with its action record appended, as the AI sees it in later turns. */
export function withActions(content: string, actions: ActionRecord[] | null | undefined): string {
  if (!actions || actions.length === 0) return content;
  const lines = actions.map(
    (a) => `- ${a.tool}${a.action ? ` ${a.action}` : ""}${a.failed ? " (failed)" : ""}: ${a.result}`,
  );
  return `${content}\n\n<actions>\n${lines.join("\n")}\n</actions>`;
}
