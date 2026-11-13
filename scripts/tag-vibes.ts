import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { trackClaudeUsage } from "../server/usage.js";
import { runMessageBatch, type BatchRequest } from "./claude-batch.js";
import { config } from "dotenv";
import { fetchAllRows } from "./fetch-all.js";
import {
  CANONICAL_VIBES,
  CANONICAL_VIBE_SET,
} from "../src/lib/canonical-vibes-data.js";

config();

// --- Supabase + Anthropic clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  // Background work bills the jobs workspace in the Anthropic Console
  apiKey: process.env.ANTHROPIC_JOBS_API_KEY ?? process.env.ANTHROPIC_API_KEY!,
});// Every response's cost is recorded in api_usage
trackClaudeUsage(anthropic, "vibe_tagging");


// --- Types ---

interface BookForTagging {
  id: string;
  user_id: string;
  title: string;
  author: string;
  summary: string | null;
  notes: string | null;
  genre: string | null;
  category: string | null;
  timing_raw: string | null;
}

interface VibeResult {
  id: string;
  vibes: string[];
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
// One Message Batches request for all of them, at half price (the background job uses this)
const batchMode = args.includes("--batch");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const modelIdx = args.indexOf("--model");
// --compare <file>: write each book's new vibes beside its existing ones to a JSON file
// instead of saving them, for trying another model (use with --force and --limit)
const compareIdx = args.indexOf("--compare");
const compareFile = compareIdx !== -1 ? args[compareIdx + 1] : null;

// --- Constants ---

const MODEL = modelIdx !== -1 ? args[modelIdx + 1] : "claude-sonnet-5-5";
const BATCH_SIZE = 5;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;

const CANONICAL_VIBE_LIST = CANONICAL_VIBES.map(
  (v) => `- ${v.tag}: ${v.description}`
).join("\n");

const SYSTEM_PROMPT = `You are a book curator assigning canonical vibe tags to books. You must choose
from ONLY the following 17 vibes:

${CANONICAL_VIBE_LIST}

Rules:
- Assign 1-3 canonical vibes per book (most books get 2)
- You MUST only use tags from the list above — no other tags allowed
- Use the exact tag text (lowercase) as shown above
- Choose the vibes that best capture the book's core reading experience

Return ONLY a JSON array. No other text.`;

// --- Helpers ---

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function formatBookBlock(book: BookForTagging, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index}] id: ${book.id}`);
  lines.push(`"${book.title}" by ${book.author}`);

  if (book.genre) lines.push(`Genre: ${book.genre}`);
  else if (book.category) lines.push(`Category: ${book.category}`);

  if (book.timing_raw) lines.push(`When to Read: ${book.timing_raw}`);
  if (book.summary) lines.push(`Summary: ${truncate(book.summary, 400)}`);
  if (book.notes) lines.push(`Notes: ${truncate(book.notes, 200)}`);

  return lines.join("\n");
}

function requestParams(userPrompt: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  };
}

function buildUserPrompt(batch: BookForTagging[]): string {
  const blocks = batch.map((book, i) => formatBookBlock(book, i + 1));
  return (
    "Assign canonical vibes to these books. Choose 1-3 from the allowed list only." +
    "\n\n" +
    blocks.join("\n\n") +
    '\n\nRespond with JSON only:\n[{"id":"<uuid>","vibes":["vibe1","vibe2",...]},...]'
  );
}

function parseResponse(raw: string, batchIds: Set<string>): VibeResult[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  const results: VibeResult[] = [];

  for (const entry of parsed) {
    if (
      typeof entry.id !== "string" ||
      !batchIds.has(entry.id) ||
      !Array.isArray(entry.vibes) ||
      entry.vibes.length === 0
    ) {
      continue;
    }

    const vibes = entry.vibes
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => v.length > 0 && CANONICAL_VIBE_SET.has(v));

    if (vibes.length > 0) {
      results.push({ id: entry.id, vibes });
    }
  }

  return results;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const compared: VibeResult[] = [];

/** Write one request's vibes to book_vibes. */
async function saveResults(
  results: VibeResult[],
  userIdMap: Map<string, string>,
  label: string,
): Promise<{ vibes: number; errors: number }> {
  if (compareFile) {
    for (const r of results) compared.push({ id: r.id, vibes: r.vibes });
    console.log(`  ${label} ✓ ${results.length} books compared`);
    return { vibes: results.reduce((n, r) => n + r.vibes.length, 0), errors: 0 };
  }
  // If --force, delete existing AI vibes for these books first
  if (force) {
    await supabase
      .from("book_vibes")
      .delete()
      .in("book_id", results.map((r) => r.id))
      .eq("ai_assigned", true)
      .eq("is_canonical", true);
  }

  // Build rows to insert (user_id + tag_category required since migrations 020/021)
  const rows = results.flatMap((r) =>
    r.vibes.map((vibe) => ({
      book_id: r.id,
      user_id: userIdMap.get(r.id)!,
      vibe,
      tag_category: "vibe",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    }))
  );

  const { error } = await supabase
    .from("book_vibes")
    .upsert(rows, { onConflict: "book_id,vibe,tag_category" });

  if (error && error.code !== "23505") {
    console.log(`  ${label} ✗ DB error: ${error.message}`);
    return { vibes: 0, errors: 1 };
  }
  // A unique constraint violation means some were already there
  console.log(`  ${label} ✓ ${rows.length} vibes${error ? " (some duplicates skipped)" : ""}`);
  return { vibes: rows.length, errors: 0 };
}

/** The --compare file: each book's existing AI vibes and the new ones. */
async function writeComparison(books: BookForTagging[], file: string): Promise<void> {
  const { writeFileSync } = await import("node:fs");
  const ids = compared.map((c) => c.id);
  const existing = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("book_vibes")
      .select("book_id, vibe")
      .in("book_id", ids.slice(i, i + 100))
      .eq("tag_category", "vibe")
      .eq("ai_assigned", true)
      .eq("is_canonical", true);
    for (const row of data ?? []) existing.set(row.book_id, [...(existing.get(row.book_id) ?? []), row.vibe]);
  }
  const byId = new Map(books.map((b) => [b.id, b]));
  const rows = compared.map((c) => ({
    id: c.id,
    title: byId.get(c.id)?.title,
    author: byId.get(c.id)?.author,
    existing: (existing.get(c.id) ?? []).sort(),
    new: [...c.vibes].sort(),
  }));
  writeFileSync(file, JSON.stringify({ model: MODEL, category: "vibe", books: rows }, null, 2));
  console.log(`Wrote ${rows.length} comparisons to ${file}`);
}

// --- Main ---

async function main() {
  console.log("Rekollekt AI Vibe Tagging (canonical)");

  // Step 1: Fetch books to tag
  let booksToTag: BookForTagging[];
  try {
    booksToTag = await fetchAllRows<BookForTagging>((from, to) =>
      supabase
        .from("books")
        .select(
          "id, user_id, title, author, summary, notes, genre, category, timing_raw"
        )
        .eq("book_type", "fiction")
        .order("title")
        .order("id")
        .range(from, to)
    );
  } catch (err) {
    console.error("Failed to fetch books:", (err as Error).message);
    process.exit(1);
  }

  if (!force) {
    // Exclude books that already have vibes of the relevant type
    // Done in-memory to avoid URL length limits with large NOT IN clauses
    let alreadyTagged: { book_id: string }[];
    try {
      alreadyTagged = await fetchAllRows<{ book_id: string }>((from, to) =>
        supabase
          .from("book_vibes")
          .select("book_id")
          .eq("ai_assigned", true)
          .eq("is_canonical", true)
          .order("book_id")
          .order("vibe")
          .order("tag_category")
          .range(from, to)
      );
    } catch (err) {
      console.error("Failed to query existing AI vibes:", (err as Error).message);
      process.exit(1);
    }

    const taggedIds = new Set(alreadyTagged.map((r) => r.book_id));
    booksToTag = booksToTag.filter((b) => !taggedIds.has(b.id));
  }

  if (limit && limit > 0) {
    booksToTag = booksToTag.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToTag.length / BATCH_SIZE);

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Books: ${booksToTag.length} | Batches: ${totalBatches} (${BATCH_SIZE} books each)`
  );
  if (force) console.log("  --force: will re-tag books with existing AI vibes");
  console.log();

  if (booksToTag.length === 0) {
    console.log("No books to tag.");
    return;
  }

  // Build user_id lookup from books (needed for insert into user-scoped book_vibes)
  const userIdMap = new Map(booksToTag.map((b) => [b.id, b.user_id]));

  // Step 2: Process batches
  let totalVibes = 0;
  let totalErrors = 0;

  if (batchMode && !dryRun) {
    const requests: BatchRequest[] = [];
    const idsByRequest = new Map<string, Set<string>>();
    for (let i = 0; i < booksToTag.length; i += BATCH_SIZE) {
      const batch = booksToTag.slice(i, i + BATCH_SIZE);
      const customId = `vibes-${Math.floor(i / BATCH_SIZE) + 1}`;
      idsByRequest.set(customId, new Set(batch.map((b) => b.id)));
      requests.push({ customId, params: requestParams(buildUserPrompt(batch)) });
    }
    const outcome = await runMessageBatch(
      anthropic,
      requests,
      async (customId, text) => {
        const results = parseResponse(text, idsByRequest.get(customId)!);
        if (results.length === 0) throw new Error("no valid vibes in the response");
        const saved = await saveResults(results, userIdMap, `[${customId}]`);
        totalVibes += saved.vibes;
        totalErrors += saved.errors;
      },
      { feature: "vibe_tagging" },
    );
    totalErrors += outcome.failed;
  } else for (let i = 0; i < booksToTag.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToTag.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const userPrompt = buildUserPrompt(batch);
    const label = `[${String(batchNum).padStart(3)}/${totalBatches}]`;

    if (dryRun) {
      console.log(`--- Batch ${batchNum}/${totalBatches} ---`);
      console.log("SYSTEM:", SYSTEM_PROMPT.slice(0, 80) + "...");
      console.log("USER:", userPrompt);
      console.log();
      continue;
    }

    let results: VibeResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create(requestParams(userPrompt));

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
            `  ${label} Retry ${attempt}/${MAX_RETRIES} (waiting ${backoff}ms)`
          );
          await sleep(backoff);
          continue;
        }

        // JSON parse error or non-retryable API error
        const errMsg =
          err instanceof Error ? err.message : String(err);
        console.log(
          `  ${label} ✗ ${errMsg}`
        );
        totalErrors++;
        break;
      }
    }

    if (results && results.length > 0) {
      const saved = await saveResults(results, userIdMap, label);
      totalVibes += saved.vibes;
      totalErrors += saved.errors;
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToTag.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  if (compareFile) await writeComparison(booksToTag, compareFile);

  if (!dryRun) {
    const avg = booksToTag.length > 0 ? (totalVibes / booksToTag.length).toFixed(1) : "0";
    console.log(
      `\nDone: ${booksToTag.length} books, ${totalVibes} vibes added (avg ${avg}/book), ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`
    );
  } else {
    console.log(`Dry run complete. ${booksToTag.length} books would be tagged.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
