import type { SupabaseClient } from "@supabase/supabase-js";

// The search_conversations tool: the reader's past conversations with the companion, by
// words in what either of them said or in a conversation's title or summary. Postgres
// full-text search (English stemming, so "dreams" finds "dreaming"), computed per query;
// a reader has hundreds or a few thousand messages, few enough to need no index.
// Row Level Security keeps it to the reader's own conversations.

export interface ConversationSearchCommand {
  query: string;
  limit?: number;
}

interface MessageHit {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  summary: string | null;
  started_at: string;
  last_message_at: string | null;
  is_onboarding: boolean;
  history_summarized_until: string | null;
  book: { title: string; author: string } | null;
}

const MAX_MESSAGE_HITS = 200;
const SNIPPETS_PER_CONVERSATION = 3;
const SNIPPET_BEFORE = 160;
const SNIPPET_AFTER = 260;

const day = (iso: string) => iso.slice(0, 10);

/** The words worth looking for in a snippet, from the reader's query. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/'s$|'/g, ""))
    .filter((w) => w.length >= 3 && !["the", "and", "about", "what", "with", "that", "this"].includes(w));
}

/** The part of a message around the first query word, so the AI sees why it matched. */
export function snippet(content: string, words: string[]): string {
  const text = content.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  // A word's start finds its other forms too ("dream" in "dreaming", "manikin" in "manikins")
  let at = -1;
  for (const word of words) {
    const stem = word.length > 5 ? word.slice(0, word.length - 2) : word;
    const i = lower.indexOf(stem);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) at = 0;

  let start = Math.max(0, at - SNIPPET_BEFORE);
  let end = Math.min(text.length, at + SNIPPET_AFTER);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

async function matchingMessages(supabase: SupabaseClient, tsquery: string): Promise<MessageHit[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, role, content, created_at")
    .textSearch("content", tsquery, { type: "websearch", config: "english" })
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGE_HITS);
  if (error) throw error;
  return (data ?? []) as MessageHit[];
}

async function matchingConversationIds(supabase: SupabaseClient, tsquery: string): Promise<string[]> {
  const [byTitle, bySummary] = await Promise.all(
    ["title", "summary"].map((column) =>
      supabase
        .from("conversations")
        .select("id")
        .textSearch(column, tsquery, { type: "websearch", config: "english" })
        .limit(50),
    ),
  );
  if (byTitle.error) throw byTitle.error;
  if (bySummary.error) throw bySummary.error;
  return [...(byTitle.data ?? []), ...(bySummary.data ?? [])].map((row) => row.id as string);
}

export async function executeConversationSearch(
  supabase: SupabaseClient,
  command: ConversationSearchCommand,
  currentConversationId: string,
): Promise<string> {
  const query = command.query?.trim();
  if (!query) throw new Error("search_conversations needs a query");
  const limit = Math.min(Math.max(Math.round(command.limit ?? 5), 1), 10);
  const words = queryWords(query);

  const { data: current } = await supabase
    .from("conversations")
    .select("history_summarized_until")
    .eq("id", currentConversationId)
    .maybeSingle();
  // This conversation is already in front of the AI, except the start of a long one,
  // which it only has as a summary
  const condensedUntil = (current?.history_summarized_until as string | null) ?? null;

  const search = async (tsquery: string) => {
    const [hits, idsByAbout] = await Promise.all([
      matchingMessages(supabase, tsquery),
      matchingConversationIds(supabase, tsquery),
    ]);
    const kept = hits.filter(
      (m) => m.conversation_id !== currentConversationId || (condensedUntil != null && m.created_at <= condensedUntil),
    );
    const ids = [...new Set([...kept.map((m) => m.conversation_id), ...idsByAbout.filter((id) => id !== currentConversationId)])];
    return { hits: kept, ids };
  };

  // Conversations with every word first, then, if those are few, ones with any of them
  const every = await search(query.replace(/["()]/g, " "));
  let hits = every.hits;
  const fullMatches = new Set(every.ids);
  let ids = every.ids;
  if (words.length > 1 && every.ids.length < limit) {
    const any = await search(words.join(" or "));
    const seen = new Set(hits.map((m) => `${m.conversation_id} ${m.created_at}`));
    hits = [...hits, ...any.hits.filter((m) => !seen.has(`${m.conversation_id} ${m.created_at}`))];
    ids = [...new Set([...ids, ...any.ids])];
  }
  if (ids.length === 0) return `No past conversations mention "${query}".`;

  const { data: rows, error } = await supabase
    .from("conversations")
    .select("id, title, summary, started_at, last_message_at, is_onboarding, history_summarized_until, book:books(title, author)")
    .in("id", ids);
  if (error) throw error;

  const conversations = ((rows ?? []) as unknown as ConversationRow[])
    .sort(
      (a, b) =>
        Number(fullMatches.has(b.id)) - Number(fullMatches.has(a.id)) ||
        (b.last_message_at ?? b.started_at).localeCompare(a.last_message_at ?? a.started_at),
    )
    .slice(0, limit);

  const sections = conversations.map((c) => {
    const isCurrent = c.id === currentConversationId;
    const title = (c.title || "Untitled").replace(/\s+/g, " ").trim();
    const name = isCurrent ? "Earlier in this conversation" : `"${title.length > 90 ? `${title.slice(0, 89)}…` : title}"`;
    const when = isCurrent ? "" : `, ${day(c.started_at)}${c.last_message_at && day(c.last_message_at) !== day(c.started_at) ? ` to ${day(c.last_message_at)}` : ""}`;
    const about = c.book ? ` (about "${c.book.title}" by ${c.book.author})` : c.is_onboarding ? " (getting started)" : "";
    const lines = [`## ${name}${when}${about}`];
    if (c.summary && !isCurrent) lines.push(`Summary: ${c.summary}`);

    // The reader's own words first, then the companion's, shown in order
    const picked = hits
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => (a.role === b.role ? b.created_at.localeCompare(a.created_at) : a.role === "user" ? -1 : 1))
      .slice(0, SNIPPETS_PER_CONVERSATION)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const m of picked) {
      lines.push(`- ${m.role === "user" ? "Reader" : "You"}, ${day(m.created_at)}: "${snippet(m.content, words)}"`);
    }
    return lines.join("\n");
  });

  const more = ids.length > conversations.length ? ` (showing the ${conversations.length} most recent)` : "";
  const partial = ids.length - fullMatches.size;
  const header =
    partial === 0
      ? `${ids.length === 1 ? "1 past conversation mentions" : `${ids.length} past conversations mention`} "${query}"${more}:`
      : `${fullMatches.size} past conversation${fullMatches.size === 1 ? "" : "s"} mention every word of "${query}", and ${partial} more mention some of them${more}. Every-word matches come first:`;
  return [header, ...sections].join("\n\n");
}
