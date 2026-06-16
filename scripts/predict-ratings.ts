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
  // Tolerate flaky networks: longer per-request timeout + SDK-level retries on
  // connection errors. Our batch loop adds a further retry layer on top.
  timeout: 120_000,
  maxRetries: 4,
});

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const userIdIdx = args.indexOf("--user-id");
const cliUserId = userIdIdx !== -1 ? args[userIdIdx + 1] : null;

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
  book_type: string | null;
  genre: string | null;
  summary: string | null;
  notes: string | null;
}

interface CalibratedBook {
  title: string;
  author: string;
  book_type: string;
  rating: number;
  genre: string | null;
  tags: { vibe: string; tag_category: string }[];
}

interface PredictionResult {
  id: string;
  predicted_rating: number;
  predicted_rationale: string;
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

  if (profile.nonfiction_identity) {
    sections.push("\n### Nonfiction Identity\n");
    sections.push(profile.nonfiction_identity);
    if (profile.nonfiction_interests && profile.nonfiction_interests.length > 0) {
      sections.push(`\nKey interests: ${profile.nonfiction_interests.join(", ")}`);
    }
  }

  if (profile.poetry_identity) {
    sections.push("\n### Poetry Identity\n");
    sections.push(profile.poetry_identity);
    if (profile.poet_affinities && profile.poet_affinities.length > 0) {
      sections.push(`\nPoet affinities: ${profile.poet_affinities.join(", ")}`);
    }
  }

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

// --- Data Gathering (all queries scoped to a single user) ---

async function fetchUsersWithProfiles(): Promise<string[]> {
  const { data, error } = await supabase
    .from("reader_profile")
    .select("user_id")
    .order("generated_at", { ascending: false });

  if (error) throw new Error(`fetchUsersWithProfiles: ${error.message}`);

  // Deduplicate — a user may have many profile generations
  const seen = new Set<string>();
  const users: string[] = [];
  for (const row of data ?? []) {
    if (row.user_id && !seen.has(row.user_id)) {
      seen.add(row.user_id);
      users.push(row.user_id);
    }
  }
  return users;
}

async function fetchLatestProfile(userId: string): Promise<{
  profile: ReaderProfileData;
  generatedAt: string;
} | null> {
  const { data, error } = await supabase
    .from("reader_profile")
    .select("profile_data, generated_at")
    .eq("user_id", userId)
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

async function countRatedBooks(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("rating", 0);

  if (error) throw new Error(`countRatedBooks: ${error.message}`);
  return count ?? 0;
}

async function fetchCalibrationSet(
  userId: string,
  tagMap: Map<string, { vibe: string; tag_category: string }[]>,
): Promise<CalibratedBook[]> {
  // Fetch all rated books for this user
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, book_type, rating, genre")
    .eq("user_id", userId)
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
        book_type: b.book_type ?? "fiction",
        rating: b.rating,
        genre: b.genre,
        tags: tagMap.get(b.id) ?? [],
      });
    }
  }

  // Sort by rating for readability
  calibration.sort((a, b) => a.rating - b.rating);
  return calibration;
}

async function fetchCanonBooks(
  userId: string,
  canonIds: string[],
): Promise<{ title: string; author: string; rating: number | null }[]> {
  if (canonIds.length === 0) return [];

  const { data, error } = await supabase
    .from("books")
    .select("title, author, rating")
    .eq("user_id", userId)
    .in("id", canonIds);

  if (error) throw new Error(`fetchCanonBooks: ${error.message}`);
  return data ?? [];
}

async function fetchUnreadBooks(userId: string): Promise<BookForPrediction[]> {
  let query = supabase
    .from("books")
    .select("id, title, author, book_type, genre, summary, notes")
    .eq("user_id", userId)
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

async function fetchAllCanonicalTags(
  userId: string,
): Promise<Map<string, { vibe: string; tag_category: string }[]>> {
  const PAGE_SIZE = 1000;
  const rows: { book_id: string; vibe: string; tag_category: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe, tag_category")
      .eq("user_id", userId)
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`fetchAllCanonicalTags: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const map = new Map<string, { vibe: string; tag_category: string }[]>();
  for (const row of rows) {
    const existing = map.get(row.book_id);
    if (existing) existing.push(row);
    else map.set(row.book_id, [row]);
  }
  return map;
}

// --- Tag formatting ---

const TAG_LABELS: Record<string, string> = {
  vibe: "vibes",
  topic: "topics",
  form: "form",
  depth: "depth",
  movement: "movement",
  formal_feel: "feel",
  accessibility: "accessibility",
};

function formatCalibrationTags(book: CalibratedBook): string {
  if (book.tags.length === 0) return "";
  if (book.book_type === "fiction") {
    const vibes = book.tags.filter((t) => t.tag_category === "vibe").map((t) => t.vibe);
    return vibes.length > 0 ? ` | vibes: ${vibes.join(", ")}` : "";
  }
  const grouped = new Map<string, string[]>();
  for (const t of book.tags) {
    const existing = grouped.get(t.tag_category);
    if (existing) existing.push(t.vibe);
    else grouped.set(t.tag_category, [t.vibe]);
  }
  const parts: string[] = [];
  for (const [cat, vals] of grouped) {
    const label = TAG_LABELS[cat] ?? cat;
    parts.push(`${label}: ${vals.join(", ")}`);
  }
  return parts.length > 0 ? ` | ${parts.join("; ")}` : "";
}

function formatBookTags(
  tags: { vibe: string; tag_category: string }[],
  bookType: string,
): string {
  if (tags.length === 0) return "";
  if (bookType === "fiction") {
    const vibes = tags.filter((t) => t.tag_category === "vibe").map((t) => t.vibe);
    return vibes.length > 0 ? `Vibes: ${vibes.join(", ")}` : "";
  }
  const grouped = new Map<string, string[]>();
  for (const t of tags) {
    const existing = grouped.get(t.tag_category);
    if (existing) existing.push(t.vibe);
    else grouped.set(t.tag_category, [t.vibe]);
  }
  const parts: string[] = [];
  for (const [cat, vals] of grouped) {
    const label = TAG_LABELS[cat] ?? cat;
    parts.push(`${label[0].toUpperCase() + label.slice(1)}: ${vals.join(", ")}`);
  }
  return parts.join(" | ");
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
      const tagStr = formatCalibrationTags(b);
      const genreStr = b.genre ? ` | ${b.genre}` : "";
      return `- ★${b.rating} "${b.title}" by ${b.author} [${b.book_type}]${genreStr}${tagStr}`;
    })
    .join("\n");

  return `You are predicting how a specific reader would rate books they haven't read yet,
based on their reading profile, taste patterns, and rating history.

## Rating Scale
0.5 to 5.0 in 0.25 increments:
- 5.0: All-time favorite, deeply impactful
- 4.0-4.75: Excellent, strongly resonated
- 3.0-3.75: Good, solid but not exceptional
- 2.0-2.75: Below average for this reader
- 0.5-1.75: Poor match, likely wouldn't finish

The library contains fiction, nonfiction, and poetry. Each type has different
classification vocabularies (vibes for fiction, topics/form/depth for nonfiction,
movement/feel/accessibility for poetry). Consider the book's type when predicting —
how this reader responds to fiction may differ from how they respond to nonfiction
or poetry.

## Reader Profile
${profileText}

## Personal Canon (these books carry more weight than their ratings alone)
${canonSection}

## Rating Calibration
${calibrationSection}

Rules:
- Return 0.25-increment ratings only (0.5, 0.75, 1.0, ..., 5.0)
- Base predictions on THIS READER's demonstrated taste, not general critical consensus
- A critically acclaimed book gets a low prediction if it doesn't match this reader's patterns
- Personal canon themes should pull related predictions UP
- Be honest: use the full range. Most predictions should have genuine spread.
- Consider the book's type: the reader may rate nonfiction or poetry on different criteria than fiction
- Include a brief rationale (1-2 sentences) explaining why this reader would rate the book this way

Return ONLY a JSON array with id, predicted_rating, and rationale fields. No other text.`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function buildUserPrompt(
  batch: BookForPrediction[],
  tagMap: Map<string, { vibe: string; tag_category: string }[]>,
): string {
  const blocks = batch.map((book, i) => {
    const bookType = book.book_type ?? "fiction";
    const lines: string[] = [];
    lines.push(`[${i + 1}] id: ${book.id}`);
    lines.push(`"${book.title}" by ${book.author} [${bookType}]`);
    if (book.genre) lines.push(`Genre: ${book.genre}`);
    const tags = tagMap.get(book.id);
    if (tags && tags.length > 0) {
      const tagStr = formatBookTags(tags, bookType);
      if (tagStr) lines.push(tagStr);
    }
    if (book.summary) lines.push(`Summary: ${truncate(book.summary, 300)}`);
    if (book.notes) lines.push(`Notes: ${truncate(book.notes, 150)}`);
    return lines.join("\n");
  });

  return (
    "Predict ratings for these unread books:\n\n" +
    blocks.join("\n\n") +
    '\n\nJSON: [{"id":"uuid","predicted_rating":N,"rationale":"..."},...]'
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

    // Round to nearest 0.25
    let rating = Math.round(entry.predicted_rating * 4) / 4;
    // Clamp to the DB-valid range (books_predicted_rating_check: 0.5–5.0)
    rating = Math.max(0.5, Math.min(5.0, rating));

    // Extract rationale (default to empty string if missing)
    const rationale = typeof entry.rationale === "string" ? entry.rationale : "";

    results.push({ id: entry.id, predicted_rating: rating, predicted_rationale: rationale });
  }

  return results;
}

// --- Helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write one book's prediction, retrying transient failures (e.g. a dropped
 * connection surfacing as "fetch failed"). Deterministic errors such as a
 * check-constraint violation are returned immediately — retrying can't help.
 * Returns null on success, or the error message on permanent failure.
 */
async function writePrediction(
  userId: string,
  result: PredictionResult,
): Promise<string | null> {
  const DB_MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from("books")
      .update({
        predicted_rating: result.predicted_rating,
        predicted_rationale: result.predicted_rationale || null,
        predicted_at: new Date().toISOString(),
      })
      .eq("id", result.id)
      .eq("user_id", userId);

    if (!error) return null;

    // Constraint / validation failures are deterministic — don't retry.
    const deterministic =
      error.code === "23514" || /violates .*constraint/i.test(error.message);
    if (deterministic || attempt === DB_MAX_RETRIES) return error.message;

    await sleep(500 * attempt);
  }
  return "unknown error";
}

// --- Per-user processing ---

interface UserResult {
  status: "predicted" | "skipped";
  reason?: string;
  books: number;
  predictions: number;
  errors: number;
}

async function processUser(userId: string): Promise<UserResult> {
  const tag = `[${userId.slice(0, 8)}]`;

  // Prerequisites — both scoped to this user
  const [profileResult, ratedCount] = await Promise.all([
    fetchLatestProfile(userId),
    countRatedBooks(userId),
  ]);

  if (!profileResult) {
    console.log(`${tag} No reader profile — skipping.`);
    return { status: "skipped", reason: "no profile", books: 0, predictions: 0, errors: 0 };
  }

  if (ratedCount < MIN_RATED_BOOKS) {
    console.log(
      `${tag} Only ${ratedCount} rated book(s) (need ${MIN_RATED_BOOKS}) — skipping.`,
    );
    return { status: "skipped", reason: "too few rated books", books: 0, predictions: 0, errors: 0 };
  }

  // Gather data (all user-scoped)
  const profileText = formatProfileForPrompt(profileResult.profile);
  const canonIds = profileResult.profile.personal_canon ?? [];

  const [canonBooks, unreadBooks, tagMap] = await Promise.all([
    fetchCanonBooks(userId, canonIds),
    fetchUnreadBooks(userId),
    fetchAllCanonicalTags(userId),
  ]);

  const calibration = await fetchCalibrationSet(userId, tagMap);

  let booksToPredict = unreadBooks;
  if (limit && limit > 0) {
    booksToPredict = booksToPredict.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToPredict.length / BATCH_SIZE);
  const systemPrompt = buildSystemPrompt(profileText, canonBooks, calibration);

  console.log(
    `${tag} ${booksToPredict.length} unread | ${totalBatches} batch(es) | ${ratedCount} rated | profile ${new Date(profileResult.generatedAt).toLocaleDateString()} | calibration ${calibration.length}`,
  );

  if (booksToPredict.length === 0) {
    return { status: "predicted", books: 0, predictions: 0, errors: 0 };
  }

  if (dryRun) {
    const firstBatch = booksToPredict.slice(0, BATCH_SIZE);
    const userPrompt = buildUserPrompt(firstBatch, tagMap);
    console.log(`\n--- System Prompt (${tag}) ---`);
    console.log(systemPrompt.slice(0, 1000) + "...");
    console.log();
    console.log(`--- User Prompt (${tag}, batch 1) ---`);
    console.log(userPrompt.slice(0, 1500) + "...");
    console.log();
    console.log(
      `Estimated input: ~${Math.ceil((systemPrompt.length + userPrompt.length) / 4)} tokens`,
    );
    return { status: "predicted", books: booksToPredict.length, predictions: 0, errors: 0 };
  }

  // Process batches
  let totalPredictions = 0;
  let totalErrors = 0;

  for (let i = 0; i < booksToPredict.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToPredict.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const userPrompt = buildUserPrompt(batch, tagMap);

    let results: PredictionResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          // A batch of 20 predictions each carry a 1-2 sentence rationale, which
          // overruns a 2048-token cap and truncates the JSON mid-string. Higher
          // caps are free (billed on tokens generated, not the cap).
          max_tokens: 8192,
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
          // Connection failures / timeouts (no HTTP status) — the common
          // transient case. APIConnectionTimeoutError extends this.
          err instanceof Anthropic.APIConnectionError ||
          (err instanceof Anthropic.APIError &&
            (err.status === 429 || err.status >= 500));

        if (isRetryable && attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.log(
            `${tag} [${String(batchNum).padStart(3)}/${totalBatches}] Retry ${attempt}/${MAX_RETRIES} (waiting ${backoff}ms)`,
          );
          await sleep(backoff);
          continue;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(
          `${tag} [${String(batchNum).padStart(3)}/${totalBatches}] ✗ ${errMsg}`,
        );
        totalErrors++;
        break;
      }
    }

    if (results && results.length > 0) {
      // Update each book individually (each gets a different predicted_rating).
      // Scope by user_id as a safety belt against any cross-user id collision.
      let batchPredictions = 0;
      let batchSum = 0;

      for (const result of results) {
        const updateError = await writePrediction(userId, result);

        if (updateError) {
          console.log(
            `${tag} [${String(batchNum).padStart(3)}/${totalBatches}] ✗ DB error for ${result.id}: ${updateError}`,
          );
          totalErrors++;
        } else {
          batchPredictions++;
          batchSum += result.predicted_rating;
        }
      }

      const avg = batchPredictions > 0 ? (batchSum / batchPredictions).toFixed(1) : "0";
      console.log(
        `${tag} [${String(batchNum).padStart(3)}/${totalBatches}] ✓ ${batchPredictions} predictions (avg ${avg})`,
      );
      totalPredictions += batchPredictions;
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToPredict.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return {
    status: "predicted",
    books: booksToPredict.length,
    predictions: totalPredictions,
    errors: totalErrors,
  };
}

// --- Main ---

async function main() {
  console.log("Rekollekt Predicted Ratings\n");

  // Determine which users to process. A single --user-id processes just that
  // user; otherwise process every user that has a reader profile.
  const users = cliUserId ? [cliUserId] : await fetchUsersWithProfiles();

  if (users.length === 0) {
    console.log(
      "No users with reader profiles found. Run: npx tsx scripts/generate-profile.ts",
    );
    return;
  }

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Model: ${MODEL} | Users: ${users.length}`,
  );
  if (force) console.log("  --force: will re-predict all unread books");
  if (limit) console.log(`  --limit: ${limit} books per user`);
  console.log();

  let totalBooks = 0;
  let totalPredictions = 0;
  let totalErrors = 0;
  let processed = 0;
  let skipped = 0;

  for (const uid of users) {
    const result = await processUser(uid);
    if (result.status === "skipped") {
      skipped++;
    } else {
      processed++;
      totalBooks += result.books;
      totalPredictions += result.predictions;
      totalErrors += result.errors;
    }

    // In dry-run, one user's preview is enough — don't spam every user's prompt.
    if (dryRun && !cliUserId) break;
  }

  console.log(
    `\nDone: ${processed} user(s) processed, ${skipped} skipped | ${totalBooks} books, ${totalPredictions} predictions, ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
