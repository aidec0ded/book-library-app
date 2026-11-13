import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { trackClaudeUsage, recordClaudeUsage } from "../server/usage.js";
import { runMessageBatch, type BatchRequest } from "./claude-batch.js";
import { config } from "dotenv";
import type {
  ReaderProfileData,
  ThematicPillar,
  TasteShift,
} from "../src/lib/types.js";
import { personallyScorableOnly, scorableOnly } from "../src/lib/release-scoring.js";
import { fetchAllRows } from "./fetch-all.js";

/*
 * Two kinds of run:
 * - Without --user-id: general scores for the month's scorable releases that have none,
 *   judged without any reader's profile.
 * - With --user-id: personal scores for one reader, on the month's notable releases
 *   (general score of NOTABLE_MIN_GENERAL or more) they have none for. The releases
 *   scheduler runs these for readers who asked for curation on the Releases page.
 */

config();

// --- Clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic({
  // Background work bills the jobs workspace in the Anthropic Console
  apiKey: process.env.ANTHROPIC_JOBS_API_KEY ?? process.env.ANTHROPIC_API_KEY!,
});// Every response's cost is recorded in api_usage
const usageTracking = trackClaudeUsage(anthropic, "release_scoring");


// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const batchMode = args.includes("--batch");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const monthIdx = args.indexOf("--month");
const singleMonth = monthIdx !== -1 ? args[monthIdx + 1] : null;
const userIdIdx = args.indexOf("--user-id");
const userId = userIdIdx !== -1 ? args[userIdIdx + 1] : null;
usageTracking.setUser(userId);
const batchSizeIdx = args.indexOf("--batch-size");
// --compare <file>: write the new scores beside the existing ones to a JSON file instead
// of saving them, for checking a change (use with --force and --limit)
const compareIdx = args.indexOf("--compare");
const compareFile = compareIdx !== -1 ? args[compareIdx + 1] : null;

// --- Constants ---

const MODEL = "claude-sonnet-5-5";
// Releases per request. 25 rather than 10 sends the instructions (and for personal
// scores, the reader's profile) less often; tested against 10 in November 2026
const BATCH_SIZE = batchSizeIdx !== -1 ? parseInt(args[batchSizeIdx + 1], 10) : 25;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;
const SYNOPSIS_MAX_CHARS = 400;
const SUBJECTS_CAP = 6;

// --- Types ---

interface ReleaseForScoring {
  id: string;
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string | null;
  synopsis: string | null;
  subjects: string[];
  page_count: number | null;
  general_signal_score: number | null;
}

interface CalibratedBook {
  title: string;
  author: string;
  book_type: string;
  rating: number;
  genre: string | null;
  tags: { vibe: string; tag_category: string }[];
}

interface ScoreResult {
  isbn: string;
  general_signal: number;
  personal_match?: number;
  rationale: string;
}

// --- Profile formatting (mirrors predict-ratings.ts) ---

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

// --- Data Gathering ---

async function fetchLatestProfile(): Promise<{
  profile: ReaderProfileData;
  generatedAt: string;
} | null> {
  // General scores are judged without a profile, so no one reader's taste shapes them
  if (!userId) return null;

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

async function fetchCanonBooks(
  canonIds: string[],
): Promise<{ title: string; author: string; rating: number | null }[]> {
  if (canonIds.length === 0) return [];

  let query = supabase
    .from("books")
    .select("title, author, rating")
    .in("id", canonIds);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) throw new Error(`fetchCanonBooks: ${error.message}`);
  return data ?? [];
}

async function fetchAllCanonicalTags(): Promise<
  Map<string, { vibe: string; tag_category: string }[]>
> {
  const PAGE_SIZE = 1000;
  const rows: { book_id: string; vibe: string; tag_category: string }[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("book_vibes")
      .select("book_id, vibe, tag_category")
      .eq("is_canonical", true);

    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

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

async function fetchCalibrationSet(
  tagMap: Map<string, { vibe: string; tag_category: string }[]>,
): Promise<CalibratedBook[]> {
  let query = supabase
    .from("books")
    .select("id, title, author, book_type, rating, genre")
    .gt("rating", 0)
    .order("rating");

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

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

  const samplesPerTier: Record<string, number> = {
    low: 3,
    "mid-low": 2,
    "mid-high": 2,
    high: 3,
  };

  const calibration: CalibratedBook[] = [];
  for (const [tier, books] of tiers) {
    const sampleSize = Math.min(samplesPerTier[tier] ?? 2, books.length);
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

  calibration.sort((a, b) => a.rating - b.rating);
  return calibration;
}

function getTargetMonth(): { year: number; month: number } {
  if (singleMonth) {
    const [y, m] = singleMonth.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) {
      console.error(`Invalid --month format: ${singleMonth} (expected YYYY-MM)`);
      process.exit(1);
    }
    return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * The month's releases that need scoring. Without --user-id, scorable releases with
 * no general score. With --user-id, notable releases (general score of
 * NOTABLE_MIN_GENERAL or more) this reader has no personal score for. --force takes
 * every release of that kind, scored or not.
 */
async function fetchReleasesToScore(
  year: number,
  month: number,
): Promise<ReleaseForScoring[]> {
  const narrow = userId ? personallyScorableOnly : scorableOnly;
  const releases = await fetchAllRows<ReleaseForScoring>((from, to) =>
    narrow(
      supabase
        .from("new_releases")
        .select("id, isbn13, title, authors, publisher, synopsis, subjects, page_count, general_signal_score")
        .eq("pub_year", year)
        .eq("pub_month", month),
    )
      .order("title")
      .order("id")
      .range(from, to),
  );

  if (force) return releases;
  if (!userId) return releases.filter((r) => r.general_signal_score == null);

  const rows = await fetchAllRows<{ release_id: string }>((from, to) =>
    supabase
      .from("user_release_scores")
      .select("release_id, new_releases!inner(id)")
      .eq("user_id", userId)
      .not("personal_score", "is", null)
      .eq("new_releases.pub_year", year)
      .eq("new_releases.pub_month", month)
      .order("release_id")
      .range(from, to),
  );
  const personallyScored = new Set(rows.map((row) => row.release_id));
  return releases.filter((r) => !personallyScored.has(r.id));
}

/** How many of the month's releases aren't scored: not yet triaged, or dropped or with nothing to judge. */
async function countNotScored(year: number, month: number): Promise<{ untriaged: number; left_out: number }> {
  const month_ = () =>
    supabase
      .from("new_releases")
      .select("id", { count: "exact", head: true })
      .eq("pub_year", year)
      .eq("pub_month", month);
  const [all, untriaged, scorable] = await Promise.all([
    month_(),
    month_().is("triaged_at", null),
    scorableOnly(month_()),
  ]);
  for (const r of [all, untriaged, scorable]) {
    if (r.error) throw new Error(`countNotScored: ${r.error.message}`);
  }
  const u = untriaged.count ?? 0;
  return { untriaged: u, left_out: (all.count ?? 0) - (scorable.count ?? 0) - u };
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

// --- Prompt Building ---

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function buildSystemPromptGeneralOnly(): string {
  return `You are scoring new book releases on general notability/signal.

## Scoring Scale (1-10)

**General Signal** — how notable is this book release?
- HIGH (8-10): Well-known or award-winning author, major publisher/imprint, synopsis shows critical praise or notable blurbs, compelling distinctive premise
- MEDIUM (4-7): Recognizable author, solid publisher, standard genre premise executed competently
- LOW (1-3): Unknown author, small or self-published press, generic or poorly described premise

## Rules
- Use the full 1-10 range. Most books are ordinary (4-6). Reserve 8+ for genuinely notable releases.
- Base scores on evidence in the metadata: author reputation signals, publisher quality, synopsis quality/distinctiveness, subject matter.
- Rationale should be 1 sentence explaining the score.

Return ONLY a JSON array. No other text.
Format: [{"isbn":"...","general_signal":N,"rationale":"..."},...]`;
}

function buildSystemPromptWithProfile(
  profileText: string,
  canonBooks: { title: string; author: string; rating: number | null }[],
  calibration: CalibratedBook[],
): string {
  const canonSection =
    canonBooks.length > 0
      ? canonBooks
          .map((b) => {
            const rating = b.rating != null && b.rating > 0 ? ` (\u2605${b.rating})` : "";
            return `- "${b.title}" by ${b.author}${rating}`;
          })
          .join("\n")
      : "No personal canon defined yet.";

  const calibrationSection = calibration
    .map((b) => {
      const tagStr = formatCalibrationTags(b);
      const genreStr = b.genre ? ` | ${b.genre}` : "";
      return `- \u2605${b.rating} "${b.title}" by ${b.author} [${b.book_type}]${genreStr}${tagStr}`;
    })
    .join("\n");

  return `You are scoring new book releases for a specific reader on two dimensions:
general notability and personal relevance.

The reader's library spans fiction, nonfiction, and poetry. Consider the book's
likely type when assessing personal match — alignment with the reader's preferences
within that type matters more than general thematic overlap.

## Scoring Scales (1-10 each)

**General Signal** — how notable is this book release?
- HIGH (8-10): Well-known or award-winning author, major publisher/imprint, synopsis shows critical praise or notable blurbs, compelling distinctive premise
- MEDIUM (4-7): Recognizable author, solid publisher, standard genre premise executed competently
- LOW (1-3): Unknown author, small or self-published press, generic or poorly described premise

**Personal Match** — how well does this book match THIS reader?
- HIGH (8-10): Author in library or adjacent to favorites, themes align with thematic pillars, emotional register matches patterns, genre intersects current gravitational pulls
- MEDIUM (4-7): Some thematic overlap, genre reader engages with but nothing distinctive
- LOW (1-3): Genre/style reader avoids or rates poorly, emotional register clashes, no connection to pillars

## Reader Profile
${profileText}

## Personal Canon
${canonSection}

## Rating Calibration (how this reader has rated books)
${calibrationSection}

## Rules
- Use the full 1-10 range for both scores. Most books are ordinary.
- Be selective with 8+ personal scores — reserve for books with strong specific connections to this reader's taste.
- Rationale should be 1 sentence focusing on why this reader specifically would or wouldn't connect with this book.
- If metadata is sparse, score conservatively (lean toward 4-5).

Return ONLY a JSON array. No other text.
Format: [{"isbn":"...","general_signal":N,"personal_match":N,"rationale":"..."},...]`;
}

function buildUserPrompt(batch: ReleaseForScoring[]): string {
  const blocks = batch.map((release, i) => {
    const lines: string[] = [];
    lines.push(`[${i + 1}] isbn: ${release.isbn13}`);
    lines.push(`"${release.title}" by ${release.authors.join(", ") || "Unknown"}`);
    if (release.publisher) lines.push(`Publisher: ${release.publisher}`);
    if (release.page_count) lines.push(`${release.page_count} pages`);
    if (release.subjects.length > 0) {
      const subjects = release.subjects.slice(0, SUBJECTS_CAP);
      lines.push(`Subjects: ${subjects.join(", ")}`);
    }
    if (release.synopsis) {
      lines.push(`Synopsis: ${truncate(release.synopsis, SYNOPSIS_MAX_CHARS)}`);
    }
    return lines.join("\n");
  });

  const format = batch.length > 0 && singleMonth === null
    ? '[{"isbn":"...","general_signal":N,"rationale":"..."},...]'
    : '[{"isbn":"...","general_signal":N,"personal_match":N,"rationale":"..."},...]';

  return (
    "Score these new releases:\n\n" +
    blocks.join("\n\n") +
    `\n\nJSON: ${format}`
  );
}

// --- Response Parsing ---

function parseResponse(
  raw: string,
  batchIsbns: Set<string>,
): ScoreResult[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  const results: ScoreResult[] = [];

  for (const entry of parsed) {
    if (
      typeof entry.isbn !== "string" ||
      !batchIsbns.has(entry.isbn) ||
      typeof entry.general_signal !== "number"
    ) {
      continue;
    }

    const general_signal = Math.max(1, Math.min(10, Math.round(entry.general_signal)));
    const personal_match =
      typeof entry.personal_match === "number"
        ? Math.max(1, Math.min(10, Math.round(entry.personal_match)))
        : undefined;
    const rationale = typeof entry.rationale === "string" ? entry.rationale : "";

    results.push({
      isbn: entry.isbn,
      general_signal,
      personal_match,
      rationale,
    });
  }

  return results;
}

function computeAiScore(generalSignal: number, personalMatch?: number): number {
  if (personalMatch != null) {
    // 60% personal, 40% general
    return Math.round((generalSignal * 0.4 + personalMatch * 0.6) * 10) / 10;
  }
  return generalSignal;
}

// --- Helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// --- DB Write Helpers ---

const compared: { release: ReleaseForScoring; result: ScoreResult }[] = [];

/** The --compare file: each release's existing scores and the new ones. */
async function writeComparison(file: string): Promise<void> {
  const { writeFileSync } = await import("node:fs");
  const personal = new Map<string, number>();
  if (userId) {
    const ids = compared.map((c) => c.release.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase
        .from("user_release_scores")
        .select("release_id, personal_score")
        .eq("user_id", userId)
        .in("release_id", ids.slice(i, i + 100));
      for (const row of data ?? []) personal.set(row.release_id, row.personal_score);
    }
  }
  const rows = compared.map(({ release, result }) => ({
    isbn: release.isbn13,
    title: release.title,
    authors: release.authors,
    existing: { general: release.general_signal_score, personal: personal.get(release.id) ?? null },
    new: { general: result.general_signal, personal: result.personal_match ?? null, rationale: result.rationale },
  }));
  writeFileSync(file, JSON.stringify({ model: MODEL, batch_size: BATCH_SIZE, user: userId, releases: rows }, null, 2));
  console.log(`Wrote ${rows.length} comparisons to ${file}`);
}

async function writeScoreResults(
  results: ScoreResult[],
  label: string,
): Promise<{ scored: number; errors: number; scores: number[] }> {
  let scored = 0;
  let errors = 0;
  const scores: number[] = [];

  for (const result of results) {
    const release = releasesByIsbn.get(result.isbn);
    if (!release) continue;

    if (compareFile) {
      compared.push({ release, result });
      scored++;
      scores.push(computeAiScore(result.general_signal, result.personal_match));
      continue;
    }

    // The general score is shared by every reader. Keep the one already there, so
    // scoring a second reader doesn't rewrite it, unless --force asked for a rescore.
    const keepGeneral = release.general_signal_score != null && !force;
    const generalSignal = keepGeneral ? release.general_signal_score! : result.general_signal;
    const aiScore = computeAiScore(generalSignal, result.personal_match);

    if (!keepGeneral) {
      const { error: generalError } = await supabase
        .from("new_releases")
        .update({ general_signal_score: result.general_signal })
        .eq("id", release.id);

      if (generalError) {
        console.log(
          `  ${label} \u2717 DB error for ${result.isbn}: ${generalError.message}`,
        );
        errors++;
        continue;
      }
    }

    // Write personal scores to user_release_scores if --user-id provided
    if (userId && result.personal_match != null) {
      const { error: userScoreError } = await supabase
        .from("user_release_scores")
        .upsert(
          {
            user_id: userId,
            release_id: release.id,
            personal_score: result.personal_match,
            ai_score: aiScore,
            ai_rationale: result.rationale,
            scored_at: new Date().toISOString(),
          },
          { onConflict: "user_id,release_id" },
        );

      if (userScoreError) {
        console.log(
          `  ${label} \u2717 User score error for ${result.isbn}: ${userScoreError.message}`,
        );
        errors++;
        continue;
      }
    }

    scored++;
    scores.push(aiScore);
  }

  return { scored, errors, scores };
}

// --- Summary ---

function printSummary(
  total: number,
  scored: number,
  errors: number,
  allScores: number[],
): void {
  const dist = {
    high: allScores.filter((s) => s >= 8).length,
    midHigh: allScores.filter((s) => s >= 6 && s < 8).length,
    mid: allScores.filter((s) => s >= 4 && s < 6).length,
    low: allScores.filter((s) => s < 4).length,
  };

  console.log(
    `\nDone: ${total} releases, ${scored} scored, ${errors} error${errors !== 1 ? "s" : ""}`,
  );
  console.log(
    `Distribution: 8-10: ${dist.high} | 6-7: ${dist.midHigh} | 4-5: ${dist.mid} | 1-3: ${dist.low}`,
  );
}

/** The releases being scored this run, for writing results back by ISBN. */
const releasesByIsbn = new Map<string, ReleaseForScoring>();

// --- Batch Mode ---

/**
 * The system prompt as a cached block. A personal prompt (with the reader's profile) is
 * the same for every request in a run, so later requests read it at a tenth of the
 * price; the general prompt is below the minimum Claude caches, so it's sent as is.
 */
function cachedSystem(systemPrompt: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
}

function requestParams(systemPrompt: string, batch: ReleaseForScoring[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: cachedSystem(systemPrompt),
    messages: [{ role: "user", content: buildUserPrompt(batch) }],
  };
}

async function runBatchMode(
  releases: ReleaseForScoring[],
  systemPrompt: string,
): Promise<void> {
  const requests: BatchRequest[] = [];
  const isbnsByRequest = new Map<string, Set<string>>();
  for (let i = 0; i < releases.length; i += BATCH_SIZE) {
    const batch = releases.slice(i, i + BATCH_SIZE);
    const customId = `score-${Math.floor(i / BATCH_SIZE) + 1}`;
    isbnsByRequest.set(customId, new Set(batch.map((r) => r.isbn13)));
    requests.push({ customId, params: requestParams(systemPrompt, batch) });
  }

  let totalScored = 0;
  let totalErrors = 0;
  const allScores: number[] = [];

  const outcome = await runMessageBatch(
    anthropic,
    requests,
    async (customId, text) => {
      const results = parseResponse(text, isbnsByRequest.get(customId)!);
      if (results.length === 0) throw new Error("no valid scores in the response");
      const label = `[${customId}]`;
      const { scored, errors, scores } = await writeScoreResults(results, label);
      totalScored += scored;
      totalErrors += errors;
      allScores.push(...scores);
      const avg = scored > 0 ? (scores.reduce((a, b) => a + b, 0) / scored).toFixed(1) : "0";
      console.log(`  ${label} \u2713 ${scored} scored (avg ${avg})`);
    },
    { feature: "release_scoring", userId },
  );
  totalErrors += outcome.failed;

  printSummary(releases.length, totalScored, totalErrors, allScores);
}

// --- Sequential Mode ---

async function runSequentialMode(
  releases: ReleaseForScoring[],
  systemPrompt: string,
): Promise<void> {
  const totalBatches = Math.ceil(releases.length / BATCH_SIZE);

  console.log("Processing...");
  let totalScored = 0;
  let totalErrors = 0;
  const allScores: number[] = [];

  for (let i = 0; i < releases.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = releases.slice(i, i + BATCH_SIZE);
    const batchIsbns = new Set(batch.map((r) => r.isbn13));
    const userPrompt = buildUserPrompt(batch);
    const batchLabel = `[${String(batchNum).padStart(3)}/${totalBatches}]`;

    let results: ScoreResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create(requestParams(systemPrompt, batch));

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text block in response");
        }

        results = parseResponse(textBlock.text, batchIsbns);
        break;
      } catch (err) {
        const isRetryable =
          err instanceof Anthropic.APIError &&
          (err.status === 429 || err.status >= 500);

        if (isRetryable && attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.log(
            `  ${batchLabel} Retry ${attempt}/${MAX_RETRIES} (waiting ${backoff}ms)`,
          );
          await sleep(backoff);
          continue;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ${batchLabel} \u2717 ${errMsg}`);
        totalErrors++;
        break;
      }
    }

    if (results && results.length > 0) {
      const { scored, errors, scores } = await writeScoreResults(results, batchLabel);
      totalScored += scored;
      totalErrors += errors;
      allScores.push(...scores);

      const avg = scored > 0 ? (scores.reduce((a, b) => a + b, 0) / scored).toFixed(1) : "0";
      console.log(`  ${batchLabel} \u2713 ${scored} scored (avg ${avg})`);
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < releases.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Distribution summary
  printSummary(releases.length, totalScored, totalErrors, allScores);
}

// --- Main ---

async function main() {
  console.log("Rekollekt Release Scoring\n");

  const target = getTargetMonth();
  const monthLabel = `${MONTH_NAMES[target.month - 1]} ${target.year}`;

  // Fetch profile (optional)
  const profileResult = await fetchLatestProfile();
  const hasProfile = profileResult != null;
  if (userId && !hasProfile) {
    console.log(`No reader profile for ${userId}, so there's nothing to score personally against.`);
    return;
  }

  let systemPrompt: string;
  let canonBooks: { title: string; author: string; rating: number | null }[] = [];
  let calibration: CalibratedBook[] = [];

  if (hasProfile) {
    const profileText = formatProfileForPrompt(profileResult.profile);
    const canonIds = profileResult.profile.personal_canon ?? [];

    const tagMap = await fetchAllCanonicalTags();
    [canonBooks, calibration] = await Promise.all([
      fetchCanonBooks(canonIds),
      fetchCalibrationSet(tagMap),
    ]);

    systemPrompt = buildSystemPromptWithProfile(profileText, canonBooks, calibration);
  } else {
    systemPrompt = buildSystemPromptGeneralOnly();
  }

  // Fetch releases to score
  // Only releases kept by triage, with a synopsis or subjects to judge from
  let releases = await fetchReleasesToScore(target.year, target.month);
  const notScored = await countNotScored(target.year, target.month);

  if (limit && limit > 0) {
    releases = releases.slice(0, limit);
  }

  for (const release of releases) releasesByIsbn.set(release.isbn13, release);

  const totalBatches = Math.ceil(releases.length / BATCH_SIZE);
  const modeLabel = dryRun ? "dry-run" : batchMode ? "batch" : "sequential";

  console.log(`  Mode: ${modeLabel} | Model: ${MODEL}`);
  console.log(`  Month: ${monthLabel} | Releases: ${releases.length} (${notScored.left_out} left out by triage or with nothing to judge)`);
  if (notScored.untriaged > 0) {
    console.log(`  ${notScored.untriaged} releases aren't triaged yet and won't be scored: run scripts/triage-releases.ts --month ${target.year}-${String(target.month).padStart(2, "0")}`);
  }
  console.log(`  Scoring: ${hasProfile ? "general + personal" : "general signal only (no reader profile)"}`);
  console.log(`  Batches: ${totalBatches} (${BATCH_SIZE} per batch)`);
  if (hasProfile) {
    console.log(`  Profile: generated ${new Date(profileResult.generatedAt).toLocaleDateString()} | Canon: ${canonBooks.length} | Calibration: ${calibration.length}`);
  }
  if (force) console.log("  --force: will re-score already-scored releases");
  if (batchMode && !dryRun) console.log("  --batch: using Batch API (50% cost savings, async processing)");
  console.log();

  if (releases.length === 0) {
    console.log("No releases to score.");
    return;
  }

  if (dryRun) {
    const firstBatch = releases.slice(0, BATCH_SIZE);
    const userPrompt = buildUserPrompt(firstBatch);
    console.log("--- System Prompt ---");
    console.log(systemPrompt.slice(0, 1500) + "...");
    console.log();
    console.log("--- User Prompt (batch 1) ---");
    console.log(userPrompt.slice(0, 1500) + (userPrompt.length > 1500 ? "..." : ""));
    console.log();
    console.log(
      `Estimated input: ~${Math.ceil((systemPrompt.length + userPrompt.length) / 4)} tokens`,
    );
    if (batchMode) {
      console.log(`Would submit ${totalBatches} requests to Batch API.`);
    }
    console.log("Dry run complete.");
    return;
  }

  if (batchMode) {
    await runBatchMode(releases, systemPrompt);
  } else {
    await runSequentialMode(releases, systemPrompt);
  }
  if (compareFile) await writeComparison(compareFile);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
