import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { loadReaderProfile } from "./profile-loader.js";

const MODEL = "claude-sonnet-4-5-20250929";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

interface CacheEntry {
  data: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

async function generateGreeting(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
): Promise<GreetingResult> {
  const readerProfile = await loadReaderProfile(supabase, userId);

  // Fetch most recent conversation's last few messages
  let recentContext = "";
  try {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .is("archived_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conv) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (msgs && msgs.length > 0) {
        recentContext = msgs
          .reverse()
          .map((m) => `${m.role}: ${(m.content as string).slice(0, 200)}`)
          .join("\n");
      }
    }
  } catch {
    // Non-critical
  }

  if (!readerProfile) {
    return { greeting: "Welcome to your library.", usage: null };
  }

  const userContent = [
    "Reader profile excerpt:",
    readerProfile.slice(0, 1000),
    recentContext ? `\nRecent conversation:\n${recentContext}` : "",
    `\nCurrent date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system:
      "Generate a warm, personal 1-2 sentence greeting for a reader returning to their library app. Reference something specific — what they're reading, a recent discussion, the season. Be brief and natural. Never mention being an AI. Wrap 1-2 evocative words or phrases in *asterisks* for visual emphasis (e.g. 'You've been drawn to stories of quiet *transformation* lately').",
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const greeting =
    textBlock && textBlock.type === "text"
      ? textBlock.text.trim()
      : "Welcome to your library.";

  return { greeting, usage: response.usage };
}

export async function getGreeting(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
): Promise<GreetingResult> {
  const entry = cache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return { greeting: entry.data, usage: null };
  }

  try {
    const result = await generateGreeting(supabase, anthropic, userId);
    cache.set(userId, { data: result.greeting, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("Greeting generation failed:", err);
    return { greeting: entry?.data ?? "Welcome to your library.", usage: null };
  }
}
