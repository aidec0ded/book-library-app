import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import type {
  ReaderProfileData,
  ThematicPillar,
  TasteShift,
} from "../src/lib/types.js";

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
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

const MODEL = "claude-sonnet-4-5-20250929";
const BATCH_SIZE = 20;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;
const MIN_RATED_BOOKS = 10;

// --- Types ---

interface BookForPrediction {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  summary: string | null;
  notes: string | null;
}

interface CalibratedBook {
  title: string;
  author: string;
  rating: number;
  genre: string | null;
  vibes: string[];
}

interface PredictionResult {
  id: string;
  predicted_rating: number;
}

// --- Profile formatting (mirrors server/profile-loader.ts) ---

function formatProfileForPrompt(profile: ReaderProfileData): string {
  const sections: string[] = [];

  sections.push("### Reader Identity\n");
  sections.push(profile.reader_identity);

  sections.push("\n### Thematic Pillars\n");
  for (const pillar of profile.thematic_pillars) {
    sections.push(formatPillar(pillar));
  }

  sections.push("\n### Taste Evolution\n");
  sections.push("**Current Gravitational Pulls**\n");
  sections.push(profile.taste_evolution.current_gravitational_pulls);

  if (profile.taste_evolution.shift_log.length > 0) {
    sections.push("\n**Shift Log**\n");
    for (const shift of profile.taste_evolution.shift_log) {
      sections.push(formatShift(shift));
    }
  }

  sections.push("\n**Consistent Throughlines**\n");
  sections.push(profile.taste_evolution.consistent_throughlines);

  sections.push("\n### Emotional Patterns\n");
  sections.push(profile.emotional_patterns);

  const snapshot = profile.reading_life_snapshot;
  sections.push("\n### Reading Life Snapshot\n");
  if (snapshot.currently_reading.length > 0) {
    sections.push(
      `Currently reading: ${snapshot.currently_reading.join(", ")}`,
    );
  }
  sections.push(snapshot.reading_pace_description);

  return sections.join("\n");
}

function formatPillar(pillar: ThematicPillar): string {
  const books = pillar.example_books.join("; ");
  return `- **${pillar.name}**: ${pillar.description} (e.g. ${books})`;
}

function formatShift(shift: TasteShift): string {
  const date = new Date(shift.noted_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
  return `- ${date}: ${shift.description}`;
}

// --- Data Gathering ---

async function fetchLatestProfile(): Promise<{
  profile: ReaderProfileData;
  generatedAt: string;
} | null> {
  const { data, error } = await supabase
    .from("reader_profile")
    .select("profile_data, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`fetchLatestProfile: ${error.message}`);
  if (!data) return null;

  return {
    profile: data.profile_data as ReaderProfileData,
    generatedAt: data.generated_at,
  };
}

async function countRatedBooks(): Promise<number> {
  const { count, error } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .gt("rating", 0);

  if (error) throw new Error(`countRatedBooks: ${error.message}`);
  return count ?? 0;
}

async function fetchCalibrationSet(
  vibeMap: Map<string, string[]>,
): Promise<CalibratedBook[]> {
  // Fetch all rated books
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, rating, genre")
    .gt("rating", 0)
    .order("rating");

  if (error) throw new Error(`fetchCalibrationSet: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Group by rating tier
  const tiers: Map<string, typeof data> = new Map();
  for (const book of data) {
    const tier =
      book.rating <= 2.0
        ? "low"
        : book.rating <= 3.0
          ? "mid-low"
          : book.rating <= 4.0
            ? "mid-high"
            : "high";
    const existing = tiers.get(tier) ?? [];
    existing.push(book);
    tiers.set(tier, existing);
  }

  // Sample from each tier
  const samplesPerTier: Record<string, number> = {
    low: 3,
    "mid-low": 2,
    "mid-high": 2,
    high: 3,
  };

  const calibration: CalibratedBook[] = [];
  for (const [tier, books] of tiers) {
    const sampleSize = Math.min(samplesPerTier[tier] ?? 2, books.length);
    // Shuffle and take sample
    const shuffled = [...books].sort(() => Math.random() - 0.5);
    for (let i = 0; i < sampleSize && calibration.length < 25; i++) {
      const b = shuffled[i];
      calibration.push({
        title: b.title,
        author: b.author,
        rating: b.rating,
        genre: b.genre,
        vibes: vibeMap.get(b.id) ?? [],
      });
    }
  }

  // Sort by rating for readability
  calibration.sort((a, b) => a.rating - b.rating);
  return calibration;
}

async function fetchCanonBooks(
  canonIds: string[],
): Promise<{ title: string; author: string; rating: number | null }[]> {
  if (canonIds.length === 0) return [];

  const { data, error } = await supabase
    .from("books")
    .select("title, author, rating")
    .in("id", canonIds);

  if (error) throw new Error(`fetchCanonBooks: ${error.message}`);
  return data ?? [];
}

async function fetchUnreadBooks(): Promise<BookForPrediction[]> {
  let query = supabase
    .from("books")
    .select("id, title, author, genre, summary, notes")
    .or("status.eq.unread,status.is.null")
    .order("title");

  if (!force) {
    query = query.is("predicted_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `fetchUnreadBooks: ${error.message}${error.message.includes("Bad Request") ? " (has migration 010 been applied?)" : ""}`,
    );
  }
  return data ?? [];
}

async function fetchAllCanonicalVibes(): Promise<Map<string, string[]>> {
  const PAGE_SIZE = 1000;
  const rows: { book_id: string; vibe: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe")
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`fetchAllCanonicalVibes: ${error.message}`);
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

// --- Prompt Building ---

function buildSystemPrompt(
  profileText: string,
  canonBooks: { title: string; author: string; rating: number | null }[],
  calibration: CalibratedBook[],
): string {
  const canonSection =
    canonBooks.length > 0
      ? canonBooks
          .map((b) => {
            const rating = b.rating != null && b.rating > 0 ? ` (★${b.rating})` : "";
            return `- "${b.title}" by ${b.author}${rating}`;
          })
          .join("\n")
      : "No personal canon defined yet.";

  const calibrationSection = calibration
    .map((b) => {
      const vibeStr = b.vibes.length > 0 ? ` | vibes: ${b.vibes.join(", ")}` : "";
      const genreStr = b.genre ? ` | ${b.genre}` : "";
      return `- ★${b.rating} "${b.title}" by ${b.author}${genreStr}${vibeStr}`;
    })
    .join("\n");

  return `You are predicting how a specific reader would rate books they haven't read yet,
based on their reading profile, taste patterns, and rating history.

## Rating Scale
0.5 to 5.0 in 0.5 increments:
- 5.0: All-time favorite, deeply impactful
- 4.0-4.5: Excellent, strongly resonated
- 3.0-3.5: Good, solid but not exceptional
- 2.0-2.5: Below average for this reader
- 0.5-1.5: Poor match, likely wouldn't finish

## Reader Profile
${profileText}

## Personal Canon (these books carry more weight than their ratings alone)
${canonSection}

## Rating Calibration
${calibrationSection}

Rules:
- Return 0.5-increment ratings only (0.5, 1.0, 1.5, ..., 5.0)
- Base predictions on THIS READER's demonstrated taste, not general critical consensus
- A critically acclaimed book gets a low prediction if it doesn't match this reader's patterns
- Personal canon themes should pull related predictions UP
- Be honest: use the full range. Most predictions should have genuine spread.

Return ONLY a JSON array. No other text.`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function buildUserPrompt(
  batch: BookForPrediction[],
  vibeMap: Map<string, string[]>,
): string {
  const blocks = batch.map((book, i) => {
    const lines: string[] = [];
    lines.push(`[${i + 1}] id: ${book.id}`);
    lines.push(`"${book.title}" by ${book.author}`);
    if (book.genre) lines.push(`Genre: ${book.genre}`);
    const vibes = vibeMap.get(book.id);
    if (vibes && vibes.length > 0) lines.push(`Vibes: ${vibes.join(", ")}`);
    if (book.summary) lines.push(`Summary: ${truncate(book.summary, 300)}`);
    if (book.notes) lines.push(`Notes: ${truncate(book.notes, 150)}`);
    return lines.join("\n");
  });

  return (
    "Predict ratings for these unread books:\n\n" +
    blocks.join("\n\n") +
    '\n\nJSON: [{"id":"uuid","predicted_rating":N},...]'
  );
}

// --- Response Parsing ---

function parseResponse(
  raw: string,
  batchIds: Set<string>,
): PredictionResult[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  const results: PredictionResult[] = [];

  for (const entry of parsed) {
    if (
      typeof entry.id !== "string" ||
      !batchIds.has(entry.id) ||
      typeof entry.predicted_rating !== "number"
    ) {
      continue;
    }

    // Round to nearest 0.5
    let rating = Math.round(entry.predicted_rating * 2) / 2;
    // Clamp to valid range
    rating = Math.max(0.5, Math.min(5.0, rating));

    results.push({ id: entry.id, predicted_rating: rating });
  }

  return results;
}

// --- Helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main ---

async function main() {
  console.log("MoodLib Predicted Ratings\n");

  // Prerequisites
  const [profileResult, ratedCount] = await Promise.all([
    fetchLatestProfile(),
    countRatedBooks(),
  ]);

  if (!profileResult) {
    console.error(
      "  No reader profile found. Run: npx tsx scripts/generate-profile.ts",
    );
    process.exit(1);
  }

  if (ratedCount < MIN_RATED_BOOKS) {
    console.error(
      `  Need at least ${MIN_RATED_BOOKS} rated books (found ${ratedCount}).`,
    );
    process.exit(1);
  }

  // Gather data
  const profileText = formatProfileForPrompt(profileResult.profile);
  const canonIds = profileResult.profile.personal_canon ?? [];

  // Fetch all canonical vibes once (avoids URL-length issues with .in() filters)
  const [canonBooks, unreadBooks, vibeMap] = await Promise.all([
    fetchCanonBooks(canonIds),
    fetchUnreadBooks(),
    fetchAllCanonicalVibes(),
  ]);

  const calibration = await fetchCalibrationSet(vibeMap);

  let booksToPredict = unreadBooks;
  if (limit && limit > 0) {
    booksToPredict = booksToPredict.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToPredict.length / BATCH_SIZE);

  const systemPrompt = buildSystemPrompt(profileText, canonBooks, calibration);

  console.log(`  Mode: ${dryRun ? "dry-run" : "live"} | Model: ${MODEL}`);
  console.log(
    `  Books: ${booksToPredict.length} unread | Batches: ${totalBatches} (${BATCH_SIZE} per batch)`,
  );
  console.log(
    `  Profile: generated ${new Date(profileResult.generatedAt).toLocaleDateString()} | Calibration: ${calibration.length} books`,
  );
  console.log(`  Rated books in library: ${ratedCount}`);
  if (force) console.log("  --force: will re-predict all unread books");
  console.log();

  if (booksToPredict.length === 0) {
    console.log("No books to predict.");
    return;
  }

  if (dryRun) {
    const firstBatch = booksToPredict.slice(0, BATCH_SIZE);
    const userPrompt = buildUserPrompt(firstBatch, vibeMap);
    console.log("--- System Prompt ---");
    console.log(systemPrompt.slice(0, 1000) + "...");
    console.log();
    console.log("--- User Prompt (batch 1) ---");
    console.log(userPrompt.slice(0, 1500) + "...");
    console.log();
    console.log(
      `Estimated input: ~${Math.ceil((systemPrompt.length + userPrompt.length) / 4)} tokens`,
    );
    console.log("Dry run complete.");
    return;
  }

  // Process batches
  console.log("Processing...");
  let totalPredictions = 0;
  let totalErrors = 0;
  const allRatings: number[] = [];

  for (let i = 0; i < booksToPredict.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToPredict.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const userPrompt = buildUserPrompt(batch, vibeMap);

    let results: PredictionResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text block in response");
        }

        results = parseResponse(textBlock.text, batchIds);
        break;
      } catch (err) {
        const isRetryable =
          err instanceof Anthropic.APIError &&
          (err.status === 429 || err.status >= 500);

        if (isRetryable && attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] Retry ${attempt}/${MAX_RETRIES} (waiting ${backoff}ms)`,
          );
          await sleep(backoff);
          continue;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(
          `  [${String(batchNum).padStart(3)}/${totalBatches}] \u2717 ${errMsg}`,
        );
        totalErrors++;
        break;
      }
    }

    if (results && results.length > 0) {
      // Update each book individually (each gets a different predicted_rating)
      let batchPredictions = 0;
      let batchSum = 0;

      for (const result of results) {
        const { error: updateError } = await supabase
          .from("books")
          .update({
            predicted_rating: result.predicted_rating,
            predicted_at: new Date().toISOString(),
          })
          .eq("id", result.id);

        if (updateError) {
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] \u2717 DB error for ${result.id}: ${updateError.message}`,
          );
          totalErrors++;
        } else {
          batchPredictions++;
          batchSum += result.predicted_rating;
          allRatings.push(result.predicted_rating);
        }
      }

      const avg = batchPredictions > 0 ? (batchSum / batchPredictions).toFixed(1) : "0";
      console.log(
        `  [${String(batchNum).padStart(3)}/${totalBatches}] \u2713 ${batchPredictions} predictions (avg ${avg})`,
      );
      totalPredictions += batchPredictions;
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToPredict.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Distribution summary
  const dist = {
    low: allRatings.filter((r) => r <= 2.0).length,
    midLow: allRatings.filter((r) => r >= 2.5 && r <= 3.0).length,
    midHigh: allRatings.filter((r) => r >= 3.5 && r <= 4.0).length,
    high: allRatings.filter((r) => r >= 4.5).length,
  };

  console.log(
    `\nDone: ${booksToPredict.length} books, ${totalPredictions} predictions, ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`,
  );
  console.log(
    `Distribution: \u26050.5-2.0: ${dist.low} | \u26052.5-3.0: ${dist.midLow} | \u26053.5-4.0: ${dist.midHigh} | \u26054.5-5.0: ${dist.high}`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
