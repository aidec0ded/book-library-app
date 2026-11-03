import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeminarContent } from "../src/lib/types.js";

interface BookRow {
  id: string;
  title: string;
  author: string;
  book_type: string | null;
  status: string | null;
  rating: number | null;
  predicted_rating: number | null;
  is_favorite: boolean;
  date_started: string | null;
  date_finished: string | null;
  summary: string | null;
  notes: string | null;
}

interface ListItemRow {
  position: number;
  rationale: string | null;
  seminar_content: SeminarContent | null;
  path_progress: string | null;
  list: { name: string; list_type: string } | null;
}

export interface LinkedBook {
  id: string;
  title: string;
}

function section(heading: string, lines: string[]): string[] {
  return lines.length > 0 ? [`\n### ${heading}`, ...lines] : [];
}

/**
 * Everything the reader has about one book, for a conversation about it. The library index
 * only has a line per book, so without this the AI would be going on the title alone.
 */
export async function buildBookContext(
  supabase: SupabaseClient,
  bookId: string,
  conversationId: string,
): Promise<{ book: LinkedBook; text: string } | null> {
  const { data: book } = await supabase
    .from("books")
    .select(
      "id, title, author, book_type, status, rating, predicted_rating, is_favorite, date_started, date_finished, summary, notes",
    )
    .eq("id", bookId)
    .maybeSingle<BookRow>();

  if (!book) return null;

  const [{ data: excerpts }, { data: items }, { data: conversations }] = await Promise.all([
    supabase
      .from("book_excerpts")
      .select("content")
      .eq("book_id", bookId)
      .order("created_at", { ascending: true }),
    supabase
      .from("list_items")
      .select("position, rationale, seminar_content, path_progress, list:lists(name, list_type)")
      .eq("book_id", bookId),
    supabase
      .from("conversations")
      .select("title, summary, last_message_at")
      .eq("book_id", bookId)
      .neq("id", conversationId)
      .order("last_message_at", { ascending: false })
      .limit(5),
  ]);

  const facts = [
    `Status: ${book.status ?? "unread"}`,
    book.book_type && `Type: ${book.book_type}`,
    book.rating != null && `Reader's rating: ${book.rating} of 5`,
    book.rating == null && book.predicted_rating != null &&
      `Predicted rating for this reader: ${book.predicted_rating} of 5`,
    book.is_favorite && "One of the reader's favorites",
    book.date_started && `Started: ${book.date_started}`,
    book.date_finished &&
      `${book.status === "unfinished" ? "Stopped" : "Finished"}: ${book.date_finished}`,
  ].filter((fact): fact is string => Boolean(fact));

  const lists = ((items ?? []) as unknown as ListItemRow[]).flatMap((item) => {
    if (!item.list) return [];
    const isPath = item.list.list_type === "reading_path";
    const seminar = item.seminar_content;
    return [
      `- #${item.position} on ${isPath ? "reading path" : "syllabus"} "${item.list.name}"${
        item.path_progress ? ` (${item.path_progress.replace("_", " ")})` : ""
      }`,
      ...(item.rationale ? [`  Why it's there: ${item.rationale}`] : []),
      ...(seminar?.pre_reading_context ? [`  Context: ${seminar.pre_reading_context}`] : []),
      ...(seminar?.focus_questions ?? []).map((question) => `  Focus question: ${question}`),
      ...(seminar?.post_reading_prompts ?? []).map((prompt) => `  After reading: ${prompt}`),
    ];
  });

  const past = (conversations ?? []).flatMap((conversation) => {
    const about = conversation.summary ?? conversation.title;
    return about ? [`- ${conversation.last_message_at.slice(0, 10)}: ${about}`] : [];
  });

  const guidance =
    book.status === "reading"
      ? `The reader is partway through. Don't reveal anything past where they've reached, and ask where that is if you don't know.`
      : book.status === "read" || book.status === "unfinished"
        ? `The reader has spent time with this book, so start from their experience of it rather than describing it.`
        : `The reader hasn't read this yet, so don't spoil it.`;

  const text = [
    `## This Conversation's Book`,
    `\nThis conversation is about "${book.title}" by ${book.author}, which the reader opened from its page in their library. ${guidance} What follows is what they already have, so build on it rather than repeating it back.`,
    `\n${facts.join("\n")}`,
    ...section("The reader's notes", book.notes ? [book.notes] : []),
    ...section("Saved from earlier conversations", (excerpts ?? []).map((e) => `- ${e.content}`)),
    ...section("Earlier conversations about this book", past),
    ...section("On the reader's lists", lists),
    ...section("Publisher's summary", book.summary ? [book.summary] : []),
  ].join("\n");

  return { book: { id: book.id, title: book.title }, text };
}
