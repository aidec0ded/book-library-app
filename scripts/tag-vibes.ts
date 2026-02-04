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
const canonical = args.includes("--canonical");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

const BATCH_SIZE = 5;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;

const FREEFORM_SYSTEM_PROMPT = `You are a book curator tagging books with "vibes" — short evocative labels
that capture mood, atmosphere, and reading experience. Vibes help readers
find books that match their current state of mind.

Rules:
- Assign 3-8 vibes per book (aim for 5)
- Use lowercase, 1-4 word phrases
- Focus on feeling, not plot mechanics or genre labels
- Mix categories: mood (melancholy, hopeful), pace (slow burn, page-turner),
  aesthetic (dark academia, cottagecore), context (beach read, rainy day read)
- Reflect seasonal timing when provided
- Be specific over generic ("locked-room mystery" over "mystery")

Return ONLY a JSON array. No other text.`;

const CANONICAL_VIBE_LIST = CANONICAL_VIBES.map(
  (v) => `- ${v.tag}: ${v.description}`
).join("\n");

const CANONICAL_SYSTEM_PROMPT = `You are a book curator assigning canonical vibe tags to books. You must choose
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
  const instruction = canonical
    ? "Assign canonical vibes to these books. Choose 1-3 from the allowed list only."
    : "Tag these books with vibes.";
  return (
    instruction +
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

    let vibes = entry.vibes
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => v.length > 0);

    // In canonical mode, only keep vibes that are in the canonical set
    if (canonical) {
      vibes = vibes.filter((v: string) => CANONICAL_VIBE_SET.has(v));
    }

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
  console.log(`MoodLib AI Vibe Tagging${canonical ? " (canonical mode)" : ""}`);

  // Step 1: Fetch books to tag
  let query = supabase
    .from("books")
    .select(
      "id, title, author, summary, notes, genre, category, timing_raw"
    )
    .not("timing_raw", "is", null)
    .order("title");

  if (!force) {
    // Exclude books that already have vibes of the relevant type
    let vibeQuery = supabase
      .from("book_vibes")
      .select("book_id")
      .eq("ai_assigned", true);

    if (canonical) {
      vibeQuery = vibeQuery.eq("is_canonical", true);
    }

    const { data: alreadyTagged, error: tagError } = await vibeQuery;

    if (tagError) {
      console.error("Failed to query existing AI vibes:", tagError.message);
      process.exit(1);
    }

    const taggedIds = [...new Set(alreadyTagged.map((r) => r.book_id))];
    if (taggedIds.length > 0) {
      query = query.not("id", "in", `(${taggedIds.join(",")})`);
    }
  }

  const { data: books, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch books:", fetchError.message);
    process.exit(1);
  }

  let booksToTag: BookForTagging[] = books ?? [];

  if (limit && limit > 0) {
    booksToTag = booksToTag.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToTag.length / BATCH_SIZE);

  const systemPrompt = canonical ? CANONICAL_SYSTEM_PROMPT : FREEFORM_SYSTEM_PROMPT;

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Books: ${booksToTag.length} | Batches: ${totalBatches} (${BATCH_SIZE} books each)`
  );
  if (force) console.log("  --force: will re-tag books with existing AI vibes");
  if (canonical) console.log("  --canonical: assigning from 17 canonical vibes only");
  console.log();

  if (booksToTag.length === 0) {
    console.log("No books to tag.");
    return;
  }

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
        let deleteQuery = supabase
          .from("book_vibes")
          .delete()
          .in("book_id", ids)
          .eq("ai_assigned", true);

        if (canonical) {
          deleteQuery = deleteQuery.eq("is_canonical", true);
        }

        await deleteQuery;
      }

      // Build rows to insert
      const rows = results.flatMap((r) =>
        r.vibes.map((vibe) => ({
          book_id: r.id,
          vibe,
          ai_assigned: true,
          user_confirmed: false,
          is_canonical: canonical,
        }))
      );

      const batchVibeCount = rows.length;

      // In canonical mode, use upsert so existing freeform vibes with
      // matching tags get promoted to is_canonical = true
      const { error: insertError } = canonical
        ? await supabase
            .from("book_vibes")
            .upsert(rows, { onConflict: "book_id,vibe" })
        : await supabase.from("book_vibes").insert(rows);

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
