import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";

/**
 * What the AI sees of a conversation. Every message is sent until the history passes
 * CONDENSE_AT_TOKENS; then everything but the most recent part is condensed into a
 * summary kept on the conversation (migration 032), and the AI gets the summary plus
 * the messages after it. The reader still sees every message.
 *
 * Condensing happens after a reply, in the background. The summary only changes when
 * the conversation is condensed again, so the prompt cache holds between condensings.
 */

const CONDENSE_AT_TOKENS = 20_000;
const KEEP_TOKENS = 8_000;
const MIN_KEEP_MESSAGES = 6;
const MAX_SUMMARY_TOKENS = 2_000;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ConversationHistory {
  summary: string | null;
  summarizedUntil: string | null;
  messages: HistoryMessage[];
}

/** Rough token count: about four characters a token in English prose. */
const estimateTokens = (messages: HistoryMessage[]) =>
  Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);

/** The conversation as the AI should see it: any summary, then the messages after it. */
export async function loadHistory(supabase: SupabaseClient, conversationId: string): Promise<ConversationHistory> {
  let summary: string | null = null;
  let summarizedUntil: string | null = null;
  const { data: conv, error } = await supabase
    .from("conversations")
    .select("history_summary, history_summarized_until")
    .eq("id", conversationId)
    .maybeSingle();
  // Before migration 032 the columns don't exist; send the whole history as before
  if (!error && conv) {
    summary = (conv.history_summary as string | null) ?? null;
    summarizedUntil = (conv.history_summarized_until as string | null) ?? null;
  }

  const messages = await fetchAllRows<HistoryMessage>((from, to) => {
    let query = supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId);
    if (summarizedUntil) query = query.gt("created_at", summarizedUntil);
    return query.order("created_at", { ascending: true }).range(from, to);
  });
  return { summary, summarizedUntil, messages };
}

/** The summary as a system prompt block. */
export function historySummaryBlock(summary: string): string {
  return `## Earlier in this conversation\n\nThe start of this conversation is condensed below, and the messages after it are in full. Carry on as if you remember all of it, and don't mention to the reader that anything was condensed.\n\n${summary}`;
}

const CONDENSE_PROMPT = `You condense the earlier part of a conversation between a reader and their reading companion, so the companion can carry on as if it remembered all of it. The companion will see your summary followed by the rest of the conversation in full.

Keep, specifically:
- Every book, story, author, and idea discussed, by name
- The reader's reactions, opinions, and reasons, using their own words where they're striking
- Interpretations the two of you reached, and where you disagreed
- Personal context the reader shared that bears on their reading
- Questions left open, and anything the companion suggested, offered, or promised to come back to

Leave out greetings, pleasantries, and restatements. Write plain prose in short paragraphs, about the reader in the third person ("the reader said"), in the order things came up. If an earlier summary is given, fold it in: the result replaces it.`;

function transcript(messages: HistoryMessage[]): string {
  return messages.map((m) => `${m.role === "user" ? "Reader" : "Companion"}: ${m.content}`).join("\n\n");
}

/** Where to split: keep the most recent `keepTokens` or more, starting on a reader's message. */
export function splitPoint(messages: HistoryMessage[], keepTokens = KEEP_TOKENS): number {
  let kept = 0;
  let split = messages.length;
  while (split > 0 && (kept < keepTokens * 4 || messages.length - split < MIN_KEEP_MESSAGES)) {
    split--;
    kept += messages[split].content.length;
  }
  // The messages sent must start with the reader's turn
  while (split < messages.length && messages[split].role !== "user") split++;
  return split;
}

/** Condense messages, folding in an earlier summary if there is one. */
export async function summarize(
  anthropic: Anthropic,
  model: string,
  previous: string | null,
  messages: HistoryMessage[],
): Promise<{ summary: string; usage: Anthropic.Messages.Usage }> {
  const input = [
    previous ? `Earlier summary:\n\n${previous}\n\n---\n\nThe conversation after it:` : "The conversation:",
    transcript(messages),
  ].join("\n\n");
  const response = await anthropic.messages.create({
    model,
    max_tokens: MAX_SUMMARY_TOKENS * 2,
    output_config: { effort: "low" },
    system: CONDENSE_PROMPT,
    messages: [{ role: "user", content: input }],
  });
  const summary = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { summary, usage: response.usage };
}

const inFlight = new Set<string>();

/**
 * Condense a conversation if its history has grown past CONDENSE_AT_TOKENS. Returns the
 * API usage when it condensed, for cost logging, or null when there was nothing to do.
 */
export async function condenseIfLong(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  model: string,
  conversationId: string,
): Promise<Anthropic.Messages.Usage | null> {
  if (inFlight.has(conversationId)) return null;
  inFlight.add(conversationId);
  try {
    const history = await loadHistory(supabase, conversationId);
    if (estimateTokens(history.messages) < CONDENSE_AT_TOKENS) return null;

    const split = splitPoint(history.messages);
    const older = history.messages.slice(0, split);
    if (older.length === 0) return null;

    const { summary, usage } = await summarize(anthropic, model, history.summary, older);
    if (!summary) return usage;

    // Only if nothing condensed it in the meantime
    let update = supabase
      .from("conversations")
      .update({ history_summary: summary, history_summarized_until: older[older.length - 1].created_at })
      .eq("id", conversationId);
    update = history.summarizedUntil
      ? update.eq("history_summarized_until", history.summarizedUntil)
      : update.is("history_summarized_until", null);
    const { error } = await update;
    if (error) throw error;
    console.log(
      `[history] Condensed ${older.length} messages of conversation ${conversationId.slice(0, 8)} into ${summary.length} characters.`,
    );
    return usage;
  } finally {
    inFlight.delete(conversationId);
  }
}
