import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";

config();

// --- Clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const bootstrap = args.includes("--bootstrap");

// --- Constants ---

const MODEL = "claude-opus-4-5-20251101";

const SYSTEM_PROMPT = `You are generating a Reader Profile for MoodLib, a personal book library app. Analyze the reader's library, conversation history, and your accumulated notes to produce a structured profile.

The profile is anti-performative: it reflects what the reader actually reads and how they actually respond, not what they wish they read. Be honest, specific, and insightful.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):

{
  "reader_identity": "Essay (2-4 paragraphs). Who this reader is based on their library. What themes they return to, what they value in literature, their relationship to difficulty vs. comfort. Specific and personal.",

  "thematic_pillars": [
    {
      "name": "Pillar name",
      "description": "What this cluster represents in the reader's taste",
      "example_books": ["Title by Author", "Title by Author"]
    }
  ],

  "taste_evolution": {
    "current_gravitational_pulls": "Essay. What the reader is reaching for right now — authors, styles, literary movements, genres, not just themes. Multi-dimensional.",
    "shift_log": [],
    "consistent_throughlines": "Essay. What hasn't changed. The constants in this reader's taste."
  },

  "emotional_patterns": "Essay (2-3 paragraphs). What kinds of books hit hardest, what the reader bounces off of, seasonal reading patterns, what they reach for in different moods.",

  "reading_life_snapshot": {
    "reading_pace_description": "Brief description of reading pace/habits"
  }
}

Guidelines:
- thematic_pillars: 4-7 pillars. Each with 2-5 example_books as "Title by Author" strings.
- shift_log: PRESERVE all existing entries provided, then add 0-2 new ones if warranted. Each entry needs "noted_at" (ISO timestamp) and "description".
- Be specific: name authors, titles, styles. Avoid generic platitudes.
- The reader_identity should feel like it was written by someone who knows this reader well.`;

// --- Data Gathering ---

interface BookRow {
  id: string;
  title: string;
  author: string;
  status: string | null;
  rating: number | null;
  genre: string | null;
  category: string | null;
  timing_raw: string | null;
  notes: string | null;
  is_favorite: boolean;
  date_finished: string | null;
}

async function fetchAllBooks(): Promise<BookRow[]> {
  const PAGE_SIZE = 1000;
  const books: BookRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select(
        "id, title, author, status, rating, genre, category, timing_raw, notes, is_favorite, date_finished",
      )
      .order("title")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    books.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return books;
}

async function fetchCanonicalVibes(): Promise<Map<string, string[]>> {
  const PAGE_SIZE = 1000;
  const rows: { book_id: string; vibe: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe")
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const existing = map.get(row.book_id);
    if (existing) existing.push(row.vibe);
    else map.set(row.book_id, [row.vibe]);
  }
  return map;
}

async function fetchMemoryFiles(): Promise<{ path: string; content: string }[]> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("path, content")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function fetchRecentMessages(
  limit: number,
): Promise<{ role: string; content: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).reverse();
}

interface PreviousProfile {
  id: string;
  profile_data: {
    personal_canon?: string[];
    taste_evolution?: {
      shift_log?: { noted_at: string; description: string }[];
    };
  };
}

async function fetchPreviousProfile(): Promise<PreviousProfile | null> {
  const { data, error } = await supabase
    .from("reader_profile")
    .select("id, profile_data")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// --- Formatting ---

function formatLibrary(books: BookRow[], vibeMap: Map<string, string[]>): string {
  const lines = books.map((b) => {
    const parts = [`"${b.title}" by ${b.author}`];
    if (b.status) parts.push(`[${b.status}]`);
    if (b.rating != null && b.rating > 0) parts.push(`★${b.rating}`);
    if (b.genre) parts.push(b.genre);
    else if (b.category) parts.push(b.category);
    if (b.is_favorite) parts.push("♥ favorite");
    const vibes = vibeMap.get(b.id);
    if (vibes) parts.push(`vibes: ${vibes.join(", ")}`);
    if (b.timing_raw) parts.push(`when: ${b.timing_raw}`);
    if (b.notes) parts.push(`notes: ${b.notes.slice(0, 200)}`);
    return parts.join(" | ");
  });
  return lines.join("\n");
}

function computeReadingLifeSnapshot(books: BookRow[]): {
  currently_reading: string[];
  recently_finished: string[];
  status_breakdown: Record<string, number>;
} {
  const currentlyReading = books
    .filter((b) => b.status === "reading")
    .map((b) => `${b.title} by ${b.author}`);

  const recentlyFinished = books
    .filter((b) => b.status === "read")
    .sort((a, b) => {
      const aDate = a.date_finished ?? "";
      const bDate = b.date_finished ?? "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, 10)
    .map((b) => `${b.title} by ${b.author}`);

  const statusBreakdown: Record<string, number> = {};
  for (const b of books) {
    const status = b.status ?? "unknown";
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
  }

  return {
    currently_reading: currentlyReading,
    recently_finished: recentlyFinished,
    status_breakdown: statusBreakdown,
  };
}

// --- Activity Snapshot ---

interface ActivitySnapshot {
  total_books: number;
  books_read: number;
  books_reading_started: number;
  books_rated: number;
  books_with_notes: number;
  total_messages: number;
}

async function gatherActivitySnapshot(): Promise<ActivitySnapshot> {
  const [
    { count: totalBooks },
    { count: booksRead },
    { count: booksReadingStarted },
    { count: booksRated },
    { count: booksWithNotes },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "read"),
    supabase.from("books").select("id", { count: "exact", head: true }).not("date_started", "is", null),
    supabase.from("books").select("id", { count: "exact", head: true }).gt("rating", 0),
    supabase.from("books").select("id", { count: "exact", head: true }).not("notes", "is", null),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);

  return {
    total_books: totalBooks ?? 0,
    books_read: booksRead ?? 0,
    books_reading_started: booksReadingStarted ?? 0,
    books_rated: booksRated ?? 0,
    books_with_notes: booksWithNotes ?? 0,
    total_messages: totalMessages ?? 0,
  };
}

// --- Main ---

async function main() {
  console.log("MoodLib Reader Profile Generation\n");

  // Check if generation is needed (unless --force)
  if (!force) {
    const prev = await fetchPreviousProfile();
    if (prev) {
      const prevDate = new Date(
        (prev as unknown as { generated_at: string }).generated_at ??
          (prev as unknown as { created_at: string }).created_at,
      );
      const now = new Date();
      if (
        prevDate.getMonth() === now.getMonth() &&
        prevDate.getFullYear() === now.getFullYear()
      ) {
        console.log(
          `  Profile already generated this month (${prevDate.toLocaleDateString()}).`,
        );
        console.log("  Use --force to regenerate.");
        return;
      }
    }
  }

  // Gather data
  const [books, vibeMap, memoryFiles, recentMessages, previousProfile] =
    await Promise.all([
      fetchAllBooks(),
      fetchCanonicalVibes(),
      bootstrap ? Promise.resolve([]) : fetchMemoryFiles(),
      bootstrap ? Promise.resolve([]) : fetchRecentMessages(100),
      fetchPreviousProfile(),
    ]);

  const previousShiftLog =
    previousProfile?.profile_data?.taste_evolution?.shift_log ?? [];
  const previousCanon = previousProfile?.profile_data?.personal_canon ?? [];

  const libraryText = formatLibrary(books, vibeMap);

  const memoryText =
    memoryFiles.length > 0
      ? memoryFiles.map((f) => `### ${f.path}\n${f.content}`).join("\n\n")
      : "No memory files yet.";

  const conversationText =
    recentMessages.length > 0
      ? recentMessages
          .map((m) => `[${m.role}] ${m.content.slice(0, 500)}`)
          .join("\n\n")
      : "No conversations yet.";

  const userPrompt = `Generate a reader profile from the following data.

## Library (${books.length} books)

${libraryText}

## Memory Files

${memoryText}

## Recent Conversations

${conversationText}

## Previous Shift Log (preserve these entries)

${JSON.stringify(previousShiftLog, null, 2)}`;

  const mode = dryRun ? "dry-run" : "live";
  console.log(`  Mode: ${mode} | Model: ${MODEL}`);
  console.log(
    `  Context: ${books.length} books | ${memoryFiles.length} memory files | ${recentMessages.length} messages`,
  );
  if (previousProfile) {
    console.log(`  Previous profile: yes`);
  }
  if (bootstrap) {
    console.log("  --bootstrap: using library data only");
  }
  console.log();

  if (dryRun) {
    console.log("--- System Prompt ---");
    console.log(SYSTEM_PROMPT.slice(0, 200) + "...");
    console.log();
    console.log("--- User Prompt ---");
    console.log(userPrompt.slice(0, 2000) + "...");
    console.log();
    console.log(
      `Estimated input: ~${Math.ceil((SYSTEM_PROMPT.length + userPrompt.length) / 4)} tokens`,
    );
    console.log("Dry run complete.");
    return;
  }

  // Generate profile
  console.log("Generating profile...");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in response");
  }

  // Parse JSON response
  let cleaned = textBlock.text.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const profileData = JSON.parse(cleaned);

  // Merge in computed reading life snapshot fields
  const snapshot = computeReadingLifeSnapshot(books);
  profileData.reading_life_snapshot = {
    ...profileData.reading_life_snapshot,
    currently_reading: snapshot.currently_reading,
    recently_finished: snapshot.recently_finished,
    status_breakdown: snapshot.status_breakdown,
  };

  // Carry forward personal canon from previous profile
  profileData.personal_canon = previousCanon;

  // Gather activity snapshot for scheduler
  const activitySnapshot = await gatherActivitySnapshot();

  // Insert new profile row
  const generationContext = {
    model: MODEL,
    book_count: books.length,
    memory_file_count: memoryFiles.length,
    message_count: recentMessages.length,
    bootstrap,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    activity_snapshot: activitySnapshot,
  };

  const { error: insertError } = await supabase
    .from("reader_profile")
    .insert({
      profile_data: profileData,
      generation_context: generationContext,
    });

  if (insertError) throw insertError;

  console.log(
    `  ✓ Profile generated (${response.usage.input_tokens} input tokens → ${response.usage.output_tokens} output tokens)`,
  );
  console.log("  ✓ Saved to database");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
