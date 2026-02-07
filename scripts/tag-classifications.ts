import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";

config();

// --- Supabase + Anthropic clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  book_type: string;
}

interface CanonicalTag {
  tag: string;
  tag_category: string;
  description: string;
}

interface NonfictionResult {
  id: string;
  topics: string[];
  form: string;
  depth: string;
}

interface PoetryResult {
  id: string;
  movement: string[];
  formal_feel: string[];
  accessibility: string;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const typeFilter = args.includes("--nonfiction")
  ? "nonfiction"
  : args.includes("--poetry")
    ? "poetry"
    : null;

// --- Constants ---

const BATCH_SIZE = 5;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;

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
  if (book.summary) lines.push(`Summary: ${truncate(book.summary, 400)}`);
  if (book.notes) lines.push(`Notes: ${truncate(book.notes, 200)}`);
  return lines.join("\n");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Nonfiction tagging ---

function buildNonfictionSystemPrompt(tags: CanonicalTag[]): string {
  const topics = tags
    .filter((t) => t.tag_category === "topic")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");
  const forms = tags
    .filter((t) => t.tag_category === "form")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");
  const depths = tags
    .filter((t) => t.tag_category === "depth")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");

  return `You are a book curator classifying nonfiction books. For each book, assign:

1. TOPICS (1-3 from the list below — what the book is about):
${topics}

2. FORM (exactly 1 — how the book presents its material):
${forms}

3. DEPTH (exactly 1 — how demanding the book is):
${depths}

Rules:
- Use ONLY tags from the lists above — exact text, lowercase
- Topics: choose 1-3 that best capture the book's subject matter
- Form: choose exactly 1
- Depth: choose exactly 1
- If a book doesn't clearly fit, use your best judgment from the available options

Return ONLY a JSON array. No other text.`;
}

function buildNonfictionUserPrompt(batch: BookForTagging[]): string {
  const blocks = batch.map((book, i) => formatBookBlock(book, i + 1));
  return (
    "Classify these nonfiction books with topics, form, and depth." +
    "\n\n" +
    blocks.join("\n\n") +
    '\n\nRespond with JSON only:\n[{"id":"<uuid>","topics":["topic1","topic2"],"form":"<form>","depth":"<depth>"},...]'
  );
}

function parseNonfictionResponse(
  raw: string,
  batchIds: Set<string>,
  validTags: Map<string, Set<string>>,
): NonfictionResult[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array");

  const results: NonfictionResult[] = [];
  const topicSet = validTags.get("topic")!;
  const formSet = validTags.get("form")!;
  const depthSet = validTags.get("depth")!;

  for (const entry of parsed) {
    if (typeof entry.id !== "string" || !batchIds.has(entry.id)) continue;

    const topics = (entry.topics ?? [])
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => topicSet.has(v));

    const form =
      typeof entry.form === "string" && formSet.has(entry.form.trim().toLowerCase())
        ? entry.form.trim().toLowerCase()
        : "";

    const depth =
      typeof entry.depth === "string" && depthSet.has(entry.depth.trim().toLowerCase())
        ? entry.depth.trim().toLowerCase()
        : "";

    if (topics.length > 0 || form || depth) {
      results.push({ id: entry.id, topics, form, depth });
    }
  }

  return results;
}

// --- Poetry tagging ---

function buildPoetrySystemPrompt(tags: CanonicalTag[]): string {
  const movements = tags
    .filter((t) => t.tag_category === "movement")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");
  const formalFeels = tags
    .filter((t) => t.tag_category === "formal_feel")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");
  const accessibilities = tags
    .filter((t) => t.tag_category === "accessibility")
    .map((t) => `- ${t.tag}: ${t.description}`)
    .join("\n");

  return `You are a book curator classifying poetry collections. For each book, assign:

1. MOVEMENT (1-2 from the list below — the aesthetic school or tradition):
${movements}

2. FORMAL FEEL (1-2 — the dominant quality of the poetry's form and language):
${formalFeels}

3. ACCESSIBILITY (exactly 1 — how much the poetry yields on first encounter):
${accessibilities}

Rules:
- Use ONLY tags from the lists above — exact text, lowercase
- Movement: choose 1-2 that best describe the poet's tradition
- Formal feel: choose 1-2 that capture the dominant quality
- Accessibility: choose exactly 1
- If a book doesn't clearly fit, use your best judgment from the available options

Return ONLY a JSON array. No other text.`;
}

function buildPoetryUserPrompt(batch: BookForTagging[]): string {
  const blocks = batch.map((book, i) => formatBookBlock(book, i + 1));
  return (
    "Classify these poetry collections with movement, formal feel, and accessibility." +
    "\n\n" +
    blocks.join("\n\n") +
    '\n\nRespond with JSON only:\n[{"id":"<uuid>","movement":["movement1"],"formal_feel":["feel1"],"accessibility":"<level>"},...]'
  );
}

function parsePoetryResponse(
  raw: string,
  batchIds: Set<string>,
  validTags: Map<string, Set<string>>,
): PoetryResult[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array");

  const results: PoetryResult[] = [];
  const movementSet = validTags.get("movement")!;
  const formalFeelSet = validTags.get("formal_feel")!;
  const accessibilitySet = validTags.get("accessibility")!;

  for (const entry of parsed) {
    if (typeof entry.id !== "string" || !batchIds.has(entry.id)) continue;

    const movement = (entry.movement ?? [])
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => movementSet.has(v));

    const formal_feel = (entry.formal_feel ?? [])
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => formalFeelSet.has(v));

    const accessibility =
      typeof entry.accessibility === "string" &&
      accessibilitySet.has(entry.accessibility.trim().toLowerCase())
        ? entry.accessibility.trim().toLowerCase()
        : "";

    if (movement.length > 0 || formal_feel.length > 0 || accessibility) {
      results.push({ id: entry.id, movement, formal_feel, accessibility });
    }
  }

  return results;
}

// --- Shared batch processing ---

interface TagRow {
  book_id: string;
  vibe: string;
  tag_category: string;
  ai_assigned: boolean;
  user_confirmed: boolean;
  is_canonical: boolean;
}

function nonfictionResultToRows(result: NonfictionResult): TagRow[] {
  const rows: TagRow[] = [];
  for (const topic of result.topics) {
    rows.push({
      book_id: result.id,
      vibe: topic,
      tag_category: "topic",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  if (result.form) {
    rows.push({
      book_id: result.id,
      vibe: result.form,
      tag_category: "form",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  if (result.depth) {
    rows.push({
      book_id: result.id,
      vibe: result.depth,
      tag_category: "depth",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  return rows;
}

function poetryResultToRows(result: PoetryResult): TagRow[] {
  const rows: TagRow[] = [];
  for (const m of result.movement) {
    rows.push({
      book_id: result.id,
      vibe: m,
      tag_category: "movement",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  for (const f of result.formal_feel) {
    rows.push({
      book_id: result.id,
      vibe: f,
      tag_category: "formal_feel",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  if (result.accessibility) {
    rows.push({
      book_id: result.id,
      vibe: result.accessibility,
      tag_category: "accessibility",
      ai_assigned: true,
      user_confirmed: false,
      is_canonical: true,
    });
  }
  return rows;
}

// --- Main ---

async function processType(
  bookType: "nonfiction" | "poetry",
  canonicalTags: CanonicalTag[],
) {
  console.log(`\n=== ${bookType.toUpperCase()} ===\n`);

  // Build valid tag sets
  const validTags = new Map<string, Set<string>>();
  for (const tag of canonicalTags) {
    if (!validTags.has(tag.tag_category)) {
      validTags.set(tag.tag_category, new Set());
    }
    validTags.get(tag.tag_category)!.add(tag.tag);
  }

  // Determine which tag categories to check for existing tags
  const categories =
    bookType === "nonfiction"
      ? ["topic", "form", "depth"]
      : ["movement", "formal_feel", "accessibility"];

  // Fetch books of this type
  const { data: books, error: fetchError } = await supabase
    .from("books")
    .select("id, title, author, summary, notes, genre, category, book_type")
    .eq("book_type", bookType)
    .order("title");

  if (fetchError) {
    console.error(`Failed to fetch ${bookType} books:`, fetchError.message);
    return;
  }

  let booksToTag: BookForTagging[] = books ?? [];

  if (!force) {
    // Exclude books that already have AI tags in any of the relevant categories
    const { data: alreadyTagged, error: tagError } = await supabase
      .from("book_vibes")
      .select("book_id, tag_category")
      .eq("ai_assigned", true)
      .eq("is_canonical", true)
      .in("tag_category", categories);

    if (tagError) {
      console.error("Failed to query existing tags:", tagError.message);
      return;
    }

    const taggedIds = new Set(alreadyTagged.map((r) => r.book_id));
    booksToTag = booksToTag.filter((b) => !taggedIds.has(b.id));
  }

  if (limit && limit > 0) {
    booksToTag = booksToTag.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToTag.length / BATCH_SIZE);

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Books: ${booksToTag.length} | Batches: ${totalBatches}`,
  );
  if (force) console.log("  --force: will re-tag books with existing AI tags");
  console.log();

  if (booksToTag.length === 0) {
    console.log(`No ${bookType} books to tag.`);
    return;
  }

  // Build prompts
  const systemPrompt =
    bookType === "nonfiction"
      ? buildNonfictionSystemPrompt(canonicalTags)
      : buildPoetrySystemPrompt(canonicalTags);

  let totalTags = 0;
  let totalErrors = 0;

  for (let i = 0; i < booksToTag.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToTag.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const userPrompt =
      bookType === "nonfiction"
        ? buildNonfictionUserPrompt(batch)
        : buildPoetryUserPrompt(batch);

    if (dryRun) {
      console.log(`--- Batch ${batchNum}/${totalBatches} ---`);
      console.log("SYSTEM:", systemPrompt.slice(0, 100) + "...");
      console.log("USER:", userPrompt);
      console.log();
      continue;
    }

    let rows: TagRow[] = [];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text block in response");
        }

        if (bookType === "nonfiction") {
          const results = parseNonfictionResponse(
            textBlock.text,
            batchIds,
            validTags,
          );
          rows = results.flatMap(nonfictionResultToRows);
        } else {
          const results = parsePoetryResponse(
            textBlock.text,
            batchIds,
            validTags,
          );
          rows = results.flatMap(poetryResultToRows);
        }
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
          `  [${String(batchNum).padStart(3)}/${totalBatches}] ✗ ${errMsg}`,
        );
        totalErrors++;
        break;
      }
    }

    if (rows.length > 0) {
      // If --force, delete existing AI tags for these books in relevant categories
      if (force) {
        const ids = [...new Set(rows.map((r) => r.book_id))];
        await supabase
          .from("book_vibes")
          .delete()
          .in("book_id", ids)
          .eq("ai_assigned", true)
          .eq("is_canonical", true)
          .in("tag_category", categories);
      }

      const { error: insertError } = await supabase
        .from("book_vibes")
        .upsert(rows, { onConflict: "book_id,vibe,tag_category" });

      if (insertError) {
        if (insertError.code === "23505") {
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] ✓ ${rows.length} tags (some duplicates skipped)`,
          );
        } else {
          console.log(
            `  [${String(batchNum).padStart(3)}/${totalBatches}] ✗ DB error: ${insertError.message}`,
          );
          totalErrors++;
        }
      } else {
        console.log(
          `  [${String(batchNum).padStart(3)}/${totalBatches}] ✓ ${rows.length} tags`,
        );
      }

      totalTags += rows.length;
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToTag.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  if (!dryRun) {
    const avg =
      booksToTag.length > 0
        ? (totalTags / booksToTag.length).toFixed(1)
        : "0";
    console.log(
      `\nDone (${bookType}): ${booksToTag.length} books, ${totalTags} tags added (avg ${avg}/book), ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`,
    );
  } else {
    console.log(
      `Dry run complete (${bookType}). ${booksToTag.length} books would be tagged.`,
    );
  }
}

async function main() {
  console.log("MoodLib AI Classification Tagging");
  console.log(
    `  Flags: ${dryRun ? "--dry-run " : ""}${force ? "--force " : ""}${limit ? `--limit ${limit} ` : ""}${typeFilter ? `--${typeFilter}` : "all types"}`,
  );

  // Fetch canonical tags from DB
  const { data: canonicalTags, error: tagError } = await supabase
    .from("canonical_tags")
    .select("tag, tag_category, description")
    .order("display_order")
    .order("tag");

  if (tagError) {
    console.error("Failed to fetch canonical tags:", tagError.message);
    process.exit(1);
  }

  const nonfictionTags = canonicalTags.filter((t) =>
    ["topic", "form", "depth"].includes(t.tag_category),
  );
  const poetryTags = canonicalTags.filter((t) =>
    ["movement", "formal_feel", "accessibility"].includes(t.tag_category),
  );

  if (!typeFilter || typeFilter === "nonfiction") {
    await processType("nonfiction", nonfictionTags);
  }

  if (!typeFilter || typeFilter === "poetry") {
    await processType("poetry", poetryTags);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
