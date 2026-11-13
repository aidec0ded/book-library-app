import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The one- or two-sentence greeting at the top of the home page.
 *
 * It's about one current thing in the reader's reading life: a book they're reading,
 * one they just finished, or their latest conversation. The reader profile is only
 * used for tone. (It used to get the first 1,000 characters of the profile and the
 * last messages of the most recently started conversation, and never saw what the
 * reader was reading, so a topic near the top of the profile won every greeting.)
 *
 * Greetings are kept in reader_greetings (migration 038): the latest is reused for an
 * hour, across server restarts, and the few before it are shown to the AI so a new
 * greeting picks a different subject.
 */

const MODEL = "claude-sonnet-5-5";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK = "Welcome to your library.";

const MAX_READING = 8;
const FINISHED_WITHIN_DAYS = 30;
const CONVERSATION_WITHIN_DAYS = 30;
const RECENT_GREETINGS = 5;
const RECENT_GREETINGS_WITHIN_DAYS = 14;
const MESSAGE_CHARS = 300;
const IDENTITY_CHARS = 600;

export interface GreetingUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface GreetingResult {
  greeting: string;
  usage: GreetingUsage | null;
}

/** The reader's own date and hour, from the browser; the server runs on UTC. */
export interface ReaderTime {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
}

/** Parse "YYYY-MM-DDTHH:MM" from the X-Reader-Time header, or null. */
export function parseReaderTime(value: string | string[] | undefined): ReaderTime | null {
  const text = Array.isArray(value) ? value[0] : value;
  const match = text?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}$/);
  if (!match) return null;
  const hour = Number(match[2]);
  return hour >= 0 && hour <= 23 ? { date: match[1], hour } : null;
}

const memory = new Map<string, { greeting: string; cachedAt: number }>();

export const GREETING_SYSTEM = `You write the greeting at the top of a reader's home page in Rekollekt, their personal library app: one or two sentences.

Greet them about one specific, current thing in their reading life: a book they're reading (a recently started one especially), a book they just finished, or the thread of their latest conversation if it was recent. Pick one and stay with it: don't list several or pair it with another book.

- Only mention the books and conversations given. Don't invent what happens in a book or what the reader thinks of it.
- The description of the reader is for tone: how they read and like to talk about books. Don't take a subject from it.
- Don't reuse the subject or angle of the recent greetings listed. Choose something else when there's anything else to choose.
- Shorten long titles the way a person would ("Why We Get Sick", not the subtitle).
- Nod to the time of day or season only if it fits naturally.
- Keep it under 40 words.
- Sound like a well-read friend: warm, dry, specific. No exclamation marks, no flattery, no sales talk. At most one light question.
- Wrap one or two evocative words or phrases in *asterisks* for emphasis.
- Never mention being an AI or the app.

Reply with the greeting only.`;

function daysBetween(fromIso: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T12:00:00Z`) - Date.parse(fromIso)) / 86_400_000);
}

function ago(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

function partOfDay(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/**
 * What the greeting is written from, as the prompt's user message. Null when there's
 * nothing to greet about (no profile, no books being read, no conversations).
 */
export async function buildGreetingContext(
  supabase: SupabaseClient,
  userId: string,
  time: ReaderTime,
): Promise<string | null> {
  const finishedSince = new Date(Date.parse(time.date) - FINISHED_WITHIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const conversationsSince = new Date(Date.now() - CONVERSATION_WITHIN_DAYS * 86_400_000).toISOString();
  const greetingsSince = new Date(Date.now() - RECENT_GREETINGS_WITHIN_DAYS * 86_400_000).toISOString();

  const [reading, finished, conversations, profile, greetings] = await Promise.all([
    supabase
      .from("books")
      .select("title, author, book_type, date_started")
      .eq("user_id", userId)
      .eq("status", "reading")
      .order("date_started", { ascending: false, nullsFirst: false })
      .limit(MAX_READING),
    supabase
      .from("books")
      .select("title, author, date_finished, rating")
      .eq("user_id", userId)
      .eq("status", "read")
      .gte("date_finished", finishedSince)
      .order("date_finished", { ascending: false })
      .limit(3),
    supabase
      .from("conversations")
      .select("id, title, last_message_at, summary, books(title)")
      .eq("user_id", userId)
      .is("archived_at", null)
      .or("is_onboarding.is.null,is_onboarding.eq.false")
      .gte("last_message_at", conversationsSince)
      .order("last_message_at", { ascending: false })
      .limit(3),
    supabase
      .from("reader_profile")
      .select("profile_data")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reader_greetings")
      .select("greeting, created_at")
      .eq("user_id", userId)
      .gte("created_at", greetingsSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_GREETINGS),
  ]);

  const sections: string[] = [];

  const readingRows = reading.data ?? [];
  if (readingRows.length > 0) {
    const lines = readingRows.map((b) => {
      const started = b.date_started ? `, started ${ago(daysBetween(b.date_started, time.date))}` : "";
      return `- "${b.title}" by ${b.author} (${b.book_type ?? "fiction"}${started})`;
    });
    sections.push(`Reading now:\n${lines.join("\n")}`);
  }

  const finishedRows = finished.data ?? [];
  if (finishedRows.length > 0) {
    const lines = finishedRows.map((b) => {
      const rating = b.rating ? `, rated ${b.rating}/5` : "";
      return `- "${b.title}" by ${b.author} (finished ${ago(daysBetween(b.date_finished, time.date))}${rating})`;
    });
    sections.push(`Finished recently:\n${lines.join("\n")}`);
  }

  const convRows = conversations.data ?? [];
  if (convRows.length > 0) {
    const lines = convRows.map((c) => {
      const book = (c.books as { title?: string } | null)?.title;
      const when = c.last_message_at ? `, last message ${ago(daysBetween(c.last_message_at, time.date))}` : "";
      const about = c.summary ? `: ${c.summary}` : "";
      return `- "${c.title ?? "Untitled"}"${book ? ` (about "${book}")` : ""}${when}${about}`;
    });
    sections.push(`Recent conversations with their reading companion, latest first:\n${lines.join("\n")}`);

    // The end of the latest one, if it was recent enough to still be on their mind
    const latest = convRows[0];
    if (latest.last_message_at && daysBetween(latest.last_message_at, time.date) <= 14) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", latest.id)
        .order("created_at", { ascending: false })
        .limit(4);
      if (msgs && msgs.length > 0) {
        const excerpt = msgs
          .reverse()
          .map((m) => {
            const text = String(m.content).replace(/\s+/g, " ").trim();
            const clipped = text.length > MESSAGE_CHARS ? `${text.slice(0, MESSAGE_CHARS)}…` : text;
            return `${m.role === "user" ? "Reader" : "Companion"}: ${clipped}`;
          })
          .join("\n");
        sections.push(`End of the latest conversation:\n${excerpt}`);
      }
    }
  }

  const identity = (profile.data?.profile_data as { reader_identity?: string } | undefined)?.reader_identity;
  // Nothing current to greet about
  if (sections.length === 0 && !identity) return null;

  if (identity) {
    const clipped = identity.length > IDENTITY_CHARS ? `${identity.slice(0, IDENTITY_CHARS)}…` : identity;
    sections.push(`The reader, for tone only (don't take a subject from this):\n${clipped}`);
  }

  // Before migration 038 the table doesn't exist; greet without the history
  const recent = greetings.error ? [] : (greetings.data ?? []);
  if (recent.length > 0) {
    sections.push(`Recent greetings, latest first (pick a different subject):\n${recent.map((g) => `- ${g.greeting}`).join("\n")}`);
  }

  const date = new Date(`${time.date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  sections.push(`It's ${date}, ${partOfDay(time.hour)}.`);

  return sections.join("\n\n");
}

async function generateGreeting(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
  time: ReaderTime,
): Promise<GreetingResult> {
  const context = await buildGreetingContext(supabase, userId, time);
  if (!context) return { greeting: FALLBACK, usage: null };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: GREETING_SYSTEM,
    messages: [{ role: "user", content: context }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const greeting = textBlock && textBlock.type === "text" ? textBlock.text.trim() : FALLBACK;
  return { greeting, usage: response.usage };
}

/** The latest greeting if it's under an hour old: from memory, or from reader_greetings after a restart. */
async function recentGreeting(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const entry = memory.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry.greeting;
  const { data, error } = await supabase
    .from("reader_greetings")
    .select("greeting, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const cachedAt = Date.parse(data.created_at);
  if (Date.now() - cachedAt >= CACHE_TTL_MS) return null;
  memory.set(userId, { greeting: data.greeting, cachedAt });
  return data.greeting;
}

export async function getGreeting(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
  time: ReaderTime | null,
): Promise<GreetingResult> {
  const cached = await recentGreeting(supabase, userId).catch(() => null);
  if (cached) return { greeting: cached, usage: null };

  const now = new Date();
  const readerTime = time ?? { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  try {
    const result = await generateGreeting(supabase, anthropic, userId, readerTime);
    memory.set(userId, { greeting: result.greeting, cachedAt: Date.now() });
    if (result.usage) {
      const { error } = await supabase.from("reader_greetings").insert({ user_id: userId, greeting: result.greeting });
      if (error) console.error("[greeting] Couldn't save the greeting:", error.message);
    }
    return result;
  } catch (err) {
    console.error("Greeting generation failed:", err);
    return { greeting: memory.get(userId)?.greeting ?? FALLBACK, usage: null };
  }
}
