import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import {
  CANONICAL_VIBES,
  CANONICAL_VIBE_SET,
} from "../src/lib/canonical-vibes.js";

config();

// --- Supabase + Anthropic clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

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

// --- Main ---

async function main() {
  console.log("Rekollekt AI Vibe Tagging (canonical)");

  // Step 1: Fetch books to tag
  let query = supabase
    .from("books")
    .select(
      "id, user_id, title, author, summary, notes, genre, category, timing_raw"
    )
    .eq("book_type", "fiction")
    .order("title");

  const { data: books, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch books:", fetchError.message);
    process.exit(1);
  }

  let booksToTag: BookForTagging[] = books ?? [];

  if (!force) {
    // Exclude books that already have vibes of the relevant type
    // Done in-memory to avoid URL length limits with large NOT IN clauses
    const { data: alreadyTagged, error: tagError } = await supabase
      .from("book_vibes")
      .select("book_id")
      .eq("ai_assigned", true)
      .eq("is_canonical", true);

    if (tagError) {
      console.error("Failed to query existing AI vibes:", tagError.message);
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

  for (let i = 0; i < booksToTag.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToTag.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const userPrompt = buildUserPrompt(batch);

    if (dryRun) {
      console.log(`--- Batch ${batchNum}/${totalBatches} ---`);
      console.log("SYSTEM:", systemPrompt.slice(0, 80) + "...");
      console.log("USER:", userPrompt);
      console.log();
      continue;
    }

    let results: VibeResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
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
            `  [${String(batchNum).padStart(3)}/${totalBatches}] Retry ${attempt}/${MAX_RETRIES} (waiting ${backoff}ms)`
          );
          await sleep(backoff);
          continue;
        }

        // JSON parse error or non-retryable API error
        const errMsg =
          err instanceof Error ? err.message : String(err);
        console.log(
          `  [${String(batchNum).padStart(3)}/${totalBatches}] ✗ ${errMsg}`
        );
        totalErrors++;
        break;
      }
    }

    if (results && results.length > 0) {
      // If --force, delete existing AI vibes for these books first
      if (force) {
        const ids = results.map((r) => r.id);
        await supabase
          .from("book_vibes")
          .delete()
          .in("book_id", ids)
          .eq("ai_assigned", true)
          .eq("is_canonical", true);
      }

      // Build rows to insert (user_id required since migration 020)
      const rows = results.flatMap((r) =>
        r.vibes.map((vibe) => ({
          book_id: r.id,
          user_id: userIdMap.get(r.id)!,
          vibe,
          ai_assigned: true,
          user_confirmed: false,
          is_canonical: true,
        }))
      );

      const batchVibeCount = rows.length;

      const { error: insertError } = await supabase
        .from("book_vibes")
        .upsert(rows, { onConflict: "book_id,vibe" });

      if (insertError) {
        // Unique constraint violations — skip silently
        if (insertError.code === "23505") {
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] ✓ ${batchVibeCount} vibes (some duplicates skipped)`
          );
        } else {
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] ✗ DB error: ${insertError.message}`
          );
          totalErrors++;
        }
      } else {
        console.log(
          `  [${String(batchNum).padStart(3)}/${totalBatches}] ✓ ${batchVibeCount} vibes`
        );
      }

      totalVibes += batchVibeCount;
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToTag.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

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
