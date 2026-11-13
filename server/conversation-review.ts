import Anthropic from "@anthropic-ai/sdk";
import { recordClaudeUsage, recordJobRun } from "./usage.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanion } from "./subscription.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STARTUP_DELAY_MS = 3 * 60 * 1000; // 3 minutes after server start
const QUIET_FOR_MS = 30 * 60 * 1000; // A conversation counts as over after 30 quiet minutes
const BATCH_SIZE = 5;
const MAX_EXCERPTS = 2;
// Nothing to keep from a single short message, so don't spend a call on it
const MIN_READER_MESSAGES = 2;
const MIN_READER_CHARACTERS = 200;

const REVIEW_PROMPT = `You read a finished conversation between a reader and their reading companion about one book, and keep what the reader would want to find again.

Return two things:

summary: one line of at most 15 words on what the conversation explored, for a list of the reader's conversations about this book. Name the ideas, not the participants. For example: "Why the ending felt earned, and the link to Stoner".

excerpts: what's worth keeping from the conversation. Most conversations deserve none or one, and never more than ${MAX_EXCERPTS}. An empty list is often the right answer.
- Keep something specific that's the reader's own: a reaction, an interpretation, or a connection they arrived at, which would mean something to them a year from now. An idea of the companion's counts only if the reader took it up and made it theirs.
- Leave out plot summary, general facts about the book, recommendations, logistics such as changing a book's status, anything the reader was only trying out, and anything already saved.
- Write each one as 1-3 sentences that stand on their own, addressed to the reader as "you", keeping their own words where you can. Don't refer to "the conversation" or "the companion".`;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    excerpts: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "excerpts"],
  additionalProperties: false,
};

interface PendingConversation {
  id: string;
  user_id: string;
  book_id: string;
  last_message_at: string;
}

export interface ConversationReview {
  summary: string;
  excerpts: string[];
}

/** Ask for a conversation's summary and excerpts. The review is null if there's nothing usable. */
export async function reviewConversation(
  anthropic: Anthropic,
  model: string,
  input: {
    bookTitle: string;
    bookAuthor: string;
    messages: { role: string; content: string }[];
    savedExcerpts: string[];
  },
): Promise<{ review: ConversationReview | null; usage: Anthropic.Beta.Messages.BetaUsage }> {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "Reader" : "Companion"}: ${m.content}`)
    .join("\n\n");
  const saved =
    input.savedExcerpts.length > 0
      ? input.savedExcerpts.map((e) => `- ${e}`).join("\n")
      : "Nothing yet.";

  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: REVIEW_SCHEMA },
    },
    system: REVIEW_PROMPT,
    messages: [
      {
        role: "user",
        content: `Book: "${input.bookTitle}" by ${input.bookAuthor}\n\nAlready saved for this book:\n${saved}\n\nConversation:\n\n${transcript}`,
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (response.stop_reason !== "end_turn" || !text || text.type !== "text") {
    return { review: null, usage: response.usage };
  }

  let parsed: ConversationReview;
  try {
    parsed = JSON.parse(text.text) as ConversationReview;
  } catch {
    // Retrying wouldn't help and would spend another call every cycle
    return { review: null, usage: response.usage };
  }

  return {
    review: {
      summary: parsed.summary.trim(),
      excerpts: parsed.excerpts
        .map((excerpt) => excerpt.trim())
        .filter(Boolean)
        .slice(0, MAX_EXCERPTS),
    },
    usage: response.usage,
  };
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
  const [{ data: subscription }, { data: book }, { data: messages }, { data: excerpts }] =
    await Promise.all([
      supabase
        .from("user_subscriptions")
        .select("plan, status")
        .eq("user_id", conversation.user_id)
        .maybeSingle(),
      // This runs with full database access, so it has to check whose book this is
      supabase
        .from("books")
        .select("title, author")
        .eq("id", conversation.book_id)
        .eq("user_id", conversation.user_id)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("book_excerpts")
        .select("content")
        .eq("book_id", conversation.book_id)
        .eq("user_id", conversation.user_id),
    ]);

  const readerMessages = (messages ?? []).filter((m) => m.role === "user");
  const readerCharacters = readerMessages.reduce((total, m) => total + m.content.length, 0);
  const worthReading =
    readerMessages.length >= MIN_READER_MESSAGES || readerCharacters >= MIN_READER_CHARACTERS;

  // Each review costs an API call, so saving by AI is part of the paid plan
  if (!subscription || !hasCompanion(subscription) || !book || !worthReading) {
    await markReviewed(supabase, conversation);
    return;
  }

  const { review, usage } = await reviewConversation(anthropic, model, {
    bookTitle: book.title,
    bookAuthor: book.author,
    messages: messages ?? [],
    savedExcerpts: (excerpts ?? []).map((e) => e.content),
  });

  await recordClaudeUsage("review", model, usage, { userId: conversation.user_id, conversationId: conversation.id });

  if (review && review.excerpts.length > 0) {
    const { error } = await supabase.from("book_excerpts").insert(
      review.excerpts.map((content) => ({
        user_id: conversation.user_id,
        book_id: conversation.book_id,
        conversation_id: conversation.id,
        content,
      })),
    );
    if (error) throw error;
  }

  await markReviewed(supabase, conversation, review?.summary);
  console.log(
    `[review] Conversation ${conversation.id.slice(0, 8)}: ${review?.excerpts.length ?? 0} excerpt(s).`,
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
      .not("book_id", "is", null)
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
 * Saves what's worth keeping from book conversations once they go quiet. It runs apart from
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
