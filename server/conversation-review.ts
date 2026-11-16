import Anthropic from "@anthropic-ai/sdk";
import { recordClaudeUsage, recordJobRun } from "./usage.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanion } from "./subscription.js";
import { normalizeFullTitle, normalizeWorkTitle } from "../src/lib/editions.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STARTUP_DELAY_MS = 3 * 60 * 1000; // 3 minutes after server start
const QUIET_FOR_MS = 30 * 60 * 1000; // A conversation counts as over after 30 quiet minutes
const BATCH_SIZE = 5;
const MAX_EXCERPTS = 2;
// Nothing to keep from a single short message, so don't spend a call on it
const MIN_READER_MESSAGES = 2;
const MIN_READER_CHARACTERS = 200;

// A general conversation can name many books; only the likeliest few are offered
const MAX_CANDIDATE_BOOKS = 12;
// Titles shorter than this ("It", "Us") match ordinary words too often to be worth a call
const MIN_TITLE_LENGTH = 4;

const EXCERPT_RULES = `excerpts: what's worth keeping from the conversation. Most conversations deserve none or one, and never more than ${MAX_EXCERPTS}. An empty list is often the right answer.
- Keep something specific that's the reader's own: a reaction, an interpretation, or a connection they arrived at, which would mean something to them a year from now. An idea of the companion's counts only if the reader took it up and made it theirs.
- Leave out plot summary, general facts about the book, recommendations, logistics such as changing a book's status, anything the reader was only trying out, and anything already saved.
- Never save anything the reader deleted, or anything close to it: they took it off the book's page because they didn't want it kept.
- Write each one as 1-3 sentences that stand on their own, addressed to the reader as "you", keeping their own words where you can. Don't refer to "the conversation" or "the companion".`;

const BOOK_PROMPT = `You read a finished conversation between a reader and their reading companion about one book, and keep what the reader would want to find again.

Return two things:

summary: one line of at most 15 words on what the conversation explored, for a list of the reader's conversations about this book. Name the ideas, not the participants. For example: "Why the ending felt earned, and the link to Stoner".

${EXCERPT_RULES}
- Each excerpt's book is the book above.`;

const GENERAL_PROMPT = `You read a finished conversation between a reader and their reading companion, and keep what the reader would want to find again on a book's page. The conversation wasn't started from a book, so it may touch on several books, or on none in any depth.

Return two things:

summary: one line of at most 15 words on what the conversation explored. Name the ideas, not the participants.

${EXCERPT_RULES}
- Each excerpt goes to one of the listed books: the one the reader's thought is about. A book only mentioned in passing, or only recommended, gets nothing. If a thought connects two books, choose the one it says more about.
- The list was found by matching titles, so some books on it may not really come up at all.`;

function reviewSchema(bookLabels: string[]) {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      excerpts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            book: { type: "string", enum: bookLabels },
            text: { type: "string" },
          },
          required: ["book", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "excerpts"],
    additionalProperties: false,
  };
}

interface PendingConversation {
  id: string;
  user_id: string;
  book_id: string | null;
  last_message_at: string;
}

/** A book the review may save to, with what's already on its page and what the reader removed. */
export interface ReviewBook {
  id: string;
  title: string;
  author: string;
  saved: string[];
  deleted: string[];
}

export interface ConversationReview {
  summary: string;
  excerpts: { bookId: string; content: string }[];
}

function bookLabel(book: { title: string; author: string }): string {
  return `"${book.title}" by ${book.author}`;
}

function bookSection(book: ReviewBook, index: number | null): string {
  const lines = [index === null ? `Book: ${bookLabel(book)}` : `${index}. ${bookLabel(book)}`];
  lines.push(
    book.saved.length > 0
      ? `Already saved for this book:\n${book.saved.map((e) => `- ${e}`).join("\n")}`
      : "Already saved for this book: nothing yet.",
  );
  if (book.deleted.length > 0) {
    lines.push(`The reader deleted these from this book:\n${book.deleted.map((e) => `- ${e}`).join("\n")}`);
  }
  return lines.join("\n");
}

function sameText(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm(a) === norm(b);
}

/**
 * Ask for a conversation's summary and excerpts. With one book, the conversation is about it;
 * with several, they're the books it names and each excerpt goes to one of them. The review
 * is null if there's nothing usable.
 */
export async function reviewConversation(
  anthropic: Anthropic,
  model: string,
  input: {
    books: ReviewBook[];
    /** Started from a book page, so about that one book */
    aboutBook: boolean;
    messages: { role: string; content: string }[];
  },
): Promise<{ review: ConversationReview | null; usage: Anthropic.Beta.Messages.BetaUsage }> {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "Reader" : "Companion"}: ${m.content}`)
    .join("\n\n");
  const books = input.aboutBook
    ? bookSection(input.books[0], null)
    : `Books from the reader's library this conversation names:\n\n${input.books.map((b, i) => bookSection(b, i + 1)).join("\n\n")}`;

  const labels = input.books.map(bookLabel);
  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: reviewSchema(labels) },
    },
    system: input.aboutBook ? BOOK_PROMPT : GENERAL_PROMPT,
    messages: [{ role: "user", content: `${books}\n\nConversation:\n\n${transcript}` }],
  });

  const text = response.content.find((block) => block.type === "text");
  if (response.stop_reason !== "end_turn" || !text || text.type !== "text") {
    return { review: null, usage: response.usage };
  }

  let parsed: { summary: string; excerpts: { book: string; text: string }[] };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    // Retrying wouldn't help and would spend another call every cycle
    return { review: null, usage: response.usage };
  }

  const excerpts: ConversationReview["excerpts"] = [];
  for (const excerpt of parsed.excerpts) {
    const book = input.books[labels.indexOf(excerpt.book)];
    const content = excerpt.text.trim();
    if (!book || !content) continue;
    // The prompt asks for neither, but a word-for-word repeat is cheap to catch
    if ([...book.saved, ...book.deleted].some((e) => sameText(e, content))) continue;
    excerpts.push({ bookId: book.id, content });
  }

  return {
    review: { summary: parsed.summary.trim(), excerpts: excerpts.slice(0, MAX_EXCERPTS) },
    usage: response.usage,
  };
}

interface LibraryBook {
  id: string;
  title: string;
  author: string;
  status: string | null;
}

async function fetchLibrary(supabase: SupabaseClient, userId: string): Promise<LibraryBook[]> {
  const PAGE_SIZE = 1000;
  const books: LibraryBook[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, status")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    books.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return books;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length - 1)) {
    count++;
  }
  return count;
}

/**
 * Whether a one-word title appears written as a title rather than as an ordinary word:
 * right after an asterisk, underscore, or quote mark, or capitalized mid-sentence.
 */
function writtenAsTitle(raw: string, title: string): boolean {
  const word = title.replace(/^(the|a|an)\s+/i, "").split(/[\s:(]/)[0];
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marked = new RegExp(`[*_"“'‘]${escaped}(?![\\p{L}\\p{N}])`, "iu");
  const capitalized = escaped.charAt(0).toUpperCase() + escaped.slice(1);
  const midSentence = new RegExp(`[\\p{Ll}\\p{N},;] ${capitalized}(?![\\p{L}\\p{N}])`, "u");
  return marked.test(raw) || midSentence.test(raw);
}

// A status that means the reader has a relationship with the book, preferred among editions
const STATUS_RANK: Record<string, number> = { reading: 4, read: 3, unfinished: 2, unread: 1 };

/**
 * The library books a conversation names, likeliest first: titles the reader used themselves
 * rank above titles only the companion used. A one-word title ("Dune", but also "Home") only
 * counts when it's written like a title: italicized, quoted, or capitalized mid-sentence.
 */
export function booksNamedIn(
  library: LibraryBook[],
  messages: { role: string; content: string }[],
): LibraryBook[] {
  const pad = (t: string) => ` ${normalizeFullTitle(t)} `;
  const readerText = pad(messages.filter((m) => m.role === "user").map((m) => m.content).join(" \n "));
  const allRaw = messages.map((m) => m.content).join("\n");
  const allText = pad(allRaw);

  const byWork = new Map<string, { book: LibraryBook; score: number }>();
  for (const book of library) {
    const key = normalizeWorkTitle(book.title);
    if (key.length < MIN_TITLE_LENGTH) continue;

    const needle = ` ${key} `;
    const total = countOccurrences(allText, needle);
    if (total === 0) continue;

    if (!key.includes(" ") && !writtenAsTitle(allRaw, book.title)) continue;

    const score = countOccurrences(readerText, needle) * 10 + total;
    const existing = byWork.get(key);
    const rank = STATUS_RANK[book.status ?? "unread"] ?? 0;
    if (!existing || rank > (STATUS_RANK[existing.book.status ?? "unread"] ?? 0)) {
      byWork.set(key, { book, score });
    }
  }

  return [...byWork.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATE_BOOKS)
    .map((entry) => entry.book);
}

/** Clear the flag unless a message has arrived since this review started. */
async function markReviewed(
  supabase: SupabaseClient,
  conversation: PendingConversation,
  summary?: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ needs_review: false, ...(summary && { summary }) })
    .eq("id", conversation.id)
    .lte("last_message_at", conversation.last_message_at);
  if (error) throw error;
}

async function processConversation(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  model: string,
  conversation: PendingConversation,
): Promise<void> {
  const [{ data: subscription }, { data: messages }] = await Promise.all([
    supabase
      .from("user_subscriptions")
      .select("plan, status")
      .eq("user_id", conversation.user_id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
  ]);

  const readerMessages = (messages ?? []).filter((m) => m.role === "user");
  const readerCharacters = readerMessages.reduce((total, m) => total + m.content.length, 0);
  const worthReading =
    readerMessages.length >= MIN_READER_MESSAGES || readerCharacters >= MIN_READER_CHARACTERS;

  // Each review costs an API call, so saving by AI is part of the paid plan
  if (!subscription || !hasCompanion(subscription) || !worthReading) {
    await markReviewed(supabase, conversation);
    return;
  }

  // This runs with full database access, so every query checks whose books these are
  let candidates: { id: string; title: string; author: string }[];
  if (conversation.book_id) {
    const { data: book } = await supabase
      .from("books")
      .select("id, title, author")
      .eq("id", conversation.book_id)
      .eq("user_id", conversation.user_id)
      .maybeSingle();
    candidates = book ? [book] : [];
  } else {
    candidates = booksNamedIn(await fetchLibrary(supabase, conversation.user_id), messages ?? []);
  }

  // A general conversation that names no book in the library has nowhere to save to
  if (candidates.length === 0) {
    await markReviewed(supabase, conversation);
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from("book_excerpts")
    .select("book_id, content, deleted_at")
    .eq("user_id", conversation.user_id)
    .in("book_id", candidates.map((b) => b.id))
    .order("created_at", { ascending: true });
  if (existingError) throw existingError;

  const books: ReviewBook[] = candidates.map((book) => {
    const forBook = (existing ?? []).filter((e) => e.book_id === book.id);
    return {
      ...book,
      saved: forBook.filter((e) => !e.deleted_at).map((e) => e.content),
      deleted: forBook.filter((e) => e.deleted_at).map((e) => e.content),
    };
  });

  const { review, usage } = await reviewConversation(anthropic, model, {
    books,
    aboutBook: conversation.book_id !== null,
    messages: messages ?? [],
  });

  await recordClaudeUsage("review", model, usage, { userId: conversation.user_id, conversationId: conversation.id });

  if (review && review.excerpts.length > 0) {
    const { error } = await supabase.from("book_excerpts").insert(
      review.excerpts.map((excerpt) => ({
        user_id: conversation.user_id,
        book_id: excerpt.bookId,
        conversation_id: conversation.id,
        content: excerpt.content,
      })),
    );
    if (error) throw error;
  }

  await markReviewed(supabase, conversation, review?.summary);
  console.log(
    `[review] Conversation ${conversation.id.slice(0, 8)}${conversation.book_id ? "" : ` (general, ${candidates.length} book(s) named)`}: ${review?.excerpts.length ?? 0} excerpt(s).`,
  );
}

let cycleInFlight = false;

async function runReviewCycle(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  model: string,
): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;

  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, user_id, book_id, last_message_at")
      .eq("needs_review", true)
      .lt("last_message_at", new Date(Date.now() - QUIET_FOR_MS).toISOString())
      .order("last_message_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    for (const conversation of (data ?? []) as PendingConversation[]) {
      try {
        await processConversation(supabase, anthropic, model, conversation);
      } catch (err) {
        console.error(
          `[review] Conversation ${conversation.id.slice(0, 8)} failed:`,
          err instanceof Error ? err.message : err,
        );
        // Temporary failures stay flagged for the next cycle. One that retrying can't fix
        // is cleared, or a few of them would hold up every conversation behind them.
        if (
          err instanceof Anthropic.APIError &&
          err.status !== undefined &&
          err.status < 500 &&
          err.status !== 429
        ) {
          await markReviewed(supabase, conversation).catch(() => {});
        }
      }
    }
    await recordJobRun("conversation_review", { ok: true });
  } catch (err) {
    console.error("[review] Cycle failed:", err instanceof Error ? err.message : err);
    await recordJobRun("conversation_review", { ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    cycleInFlight = false;
  }
}

/**
 * Saves what's worth keeping from conversations once they go quiet: a conversation started
 * from a book page to that book, any other to the library books it discusses. It runs apart from
 * the chat so the companion never has to break off a conversation to announce a save.
 */
export function startConversationReviewScheduler(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  model: string,
): void {
  console.log(
    `[review] Will check in ${STARTUP_DELAY_MS / 60000}min, then every ${CHECK_INTERVAL_MS / 60000}min.`,
  );

  setTimeout(() => {
    void runReviewCycle(supabase, anthropic, model);
    setInterval(() => void runReviewCycle(supabase, anthropic, model), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
