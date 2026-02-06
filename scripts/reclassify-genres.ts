import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";

config();

// --- Clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// --- Genre Taxonomy ---

const GENRE_TAXONOMY: { genre: string; description: string }[] = [
  // Fiction
  { genre: "Literary Fiction", description: "Character-driven, prize-adjacent, \"serious\" novels" },
  { genre: "Science Fiction", description: "Space opera, near-future, dystopian, speculative tech" },
  { genre: "Fantasy", description: "Epic, urban, magical realism, fairy tale retellings" },
  { genre: "Horror", description: "Gothic, supernatural, psychological horror" },
  { genre: "Mystery & Thriller", description: "Detective, suspense, espionage, crime fiction" },
  { genre: "Historical Fiction", description: "Novels set primarily in a past historical period" },
  { genre: "Romance", description: "Love story as central narrative arc" },
  { genre: "Young Adult", description: "Teen/middle-grade fiction" },
  // Non-fiction
  { genre: "History", description: "Historical non-fiction" },
  { genre: "Biography & Autobiography", description: "Life stories, memoirs" },
  { genre: "Cooking", description: "Cookbooks, food writing" },
  { genre: "Business & Economics", description: "Business, finance, economics" },
  { genre: "Science", description: "Popular science, mathematics, computers, technology" },
  { genre: "Political Science", description: "Politics, government, policy" },
  { genre: "Family & Relationships", description: "Parenting, relationships, family life" },
  { genre: "Health & Fitness", description: "Health, wellness, medicine, fitness" },
  { genre: "True Crime", description: "True crime narratives" },
  { genre: "Poetry", description: "Poetry collections" },
  { genre: "Nature", description: "Natural world, environment, ecology" },
  { genre: "Comics & Graphic Novels", description: "Comics, manga, graphic novels" },
  { genre: "Social Science", description: "Sociology, anthropology, cultural studies" },
  { genre: "Literary Collections", description: "Essay collections, story anthologies" },
  { genre: "Design", description: "Design, architecture, house & home, interiors" },
  { genre: "Art & Photography", description: "Visual arts, photography, performing arts" },
  { genre: "Philosophy", description: "Philosophy, ethics, logic" },
  { genre: "Religion", description: "Religion, spirituality, theology" },
  { genre: "Self-Help", description: "Self-improvement, psychology, personal development" },
  { genre: "Sports & Recreation", description: "Sports, games, outdoor recreation" },
  { genre: "Reference", description: "Language arts, dictionaries, foreign language study, general reference" },
];

const VALID_GENRES = new Set(GENRE_TAXONOMY.map((g) => g.genre));

// --- Types ---

interface BookForClassification {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  summary: string | null;
  vibes: string[];
}

interface GenreResult {
  id: string;
  genre: string;
}

interface ReviewEntry {
  id: string;
  title: string;
  author: string;
  old_genre: string | null;
  new_genre: string;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const outputIdx = args.indexOf("--output");
const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : "genre-review.json";
const applyIdx = args.indexOf("--apply");
const applyFile = applyIdx !== -1 ? args[applyIdx + 1] : null;

// --- Constants ---

const MODEL = "claude-sonnet-4-5-20250929";
const BATCH_SIZE = 20;
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 3;
const SUMMARY_MAX_CHARS = 300;

// --- System Prompt ---

const TAXONOMY_LIST = GENRE_TAXONOMY.map(
  (g) => `- ${g.genre}: ${g.description}`,
).join("\n");

const SYSTEM_PROMPT = `You are classifying books into a fixed genre taxonomy. You must assign exactly ONE genre per book from the following list:

${TAXONOMY_LIST}

## Rules
- Assign exactly 1 genre per book. No exceptions.
- Use ONLY genres from the list above — never invent new ones.
- Use the exact genre text as shown (case-sensitive).
- Primary signal: title + author recognition (you know most of these books).
- Secondary signal: summary content, existing vibes, and current genre label.
- When ambiguous (e.g. a sci-fi thriller), pick the genre most central to the book's identity.
- "Literary Fiction" is for character-driven, prize-adjacent novels — not a catch-all for fiction.
- "Young Adult" replaces "Juvenile Fiction" — use it for teen/middle-grade fiction.
- Books about mathematics, computers, or technology → "Science".
- Books about psychology or self-improvement → "Self-Help".
- Performing arts, visual art, photography → "Art & Photography".
- Architecture, house & home, interior design → "Design".
- Language arts, dictionaries, foreign language → "Reference".

Return ONLY a JSON array. No other text.`;

// --- Helpers ---

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Data Fetching ---

async function fetchBooksForClassification(): Promise<BookForClassification[]> {
  // Fetch all books
  const PAGE_SIZE = 1000;
  const allBooks: {
    id: string;
    title: string;
    author: string;
    genre: string | null;
    summary: string | null;
  }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, genre, summary")
      .order("title")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`fetchBooks: ${error.message}`);
    allBooks.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Filter to books needing reclassification
  let filtered: typeof allBooks;
  if (force) {
    filtered = allBooks;
  } else {
    filtered = allBooks.filter((b) => !b.genre || !VALID_GENRES.has(b.genre));
  }

  // Fetch all vibes (for context in prompts)
  const vibeMap = await fetchAllVibes();

  return filtered.map((b) => ({
    ...b,
    vibes: vibeMap.get(b.id) ?? [],
  }));
}

async function fetchAllVibes(): Promise<Map<string, string[]>> {
  const PAGE_SIZE = 1000;
  const rows: { book_id: string; vibe: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`fetchAllVibes: ${error.message}`);
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

function buildUserPrompt(batch: BookForClassification[]): string {
  const blocks = batch.map((book, i) => {
    const lines: string[] = [];
    lines.push(`[${i + 1}] id: ${book.id}`);
    lines.push(`"${book.title}" by ${book.author}`);
    if (book.genre) lines.push(`Current genre: ${book.genre}`);
    else lines.push(`Current genre: none`);
    if (book.summary) lines.push(`Summary: ${truncate(book.summary, SUMMARY_MAX_CHARS)}`);
    if (book.vibes.length > 0) lines.push(`Vibes: ${book.vibes.join(", ")}`);
    return lines.join("\n");
  });

  return (
    "Classify these books into the genre taxonomy:\n\n" +
    blocks.join("\n\n") +
    '\n\nJSON: [{"id":"uuid","genre":"Genre Name"},...]'
  );
}

// --- Response Parsing ---

function parseResponse(raw: string, batchIds: Set<string>): GenreResult[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  const results: GenreResult[] = [];

  for (const entry of parsed) {
    if (
      typeof entry.id !== "string" ||
      !batchIds.has(entry.id) ||
      typeof entry.genre !== "string"
    ) {
      continue;
    }

    if (!VALID_GENRES.has(entry.genre)) {
      console.warn(`  Warning: AI returned invalid genre "${entry.genre}" for ${entry.id}, skipping`);
      continue;
    }

    results.push({ id: entry.id, genre: entry.genre });
  }

  return results;
}

// --- Apply Mode ---

async function applyReviewFile(filename: string): Promise<void> {
  console.log(`MoodLib Genre Reclassification — Apply Mode\n`);

  let entries: ReviewEntry[];
  try {
    const raw = readFileSync(filename, "utf-8");
    entries = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to read ${filename}: ${msg}`);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.log("No entries to apply.");
    return;
  }

  // Validate all genres
  const invalidEntries = entries.filter((e) => !VALID_GENRES.has(e.new_genre));
  if (invalidEntries.length > 0) {
    console.error(`Found ${invalidEntries.length} entries with invalid genres:`);
    for (const e of invalidEntries.slice(0, 5)) {
      console.error(`  "${e.title}" → "${e.new_genre}"`);
    }
    process.exit(1);
  }

  console.log(`  Entries: ${entries.length}`);
  console.log(`  Source: ${filename}\n`);

  let updated = 0;
  let errors = 0;

  for (const entry of entries) {
    const { error } = await supabase
      .from("books")
      .update({ genre: entry.new_genre })
      .eq("id", entry.id);

    if (error) {
      console.error(`  Error updating "${entry.title}": ${error.message}`);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`Done: ${updated} updated, ${errors} error${errors !== 1 ? "s" : ""}`);

  // Show distribution from the applied entries
  const dist = new Map<string, number>();
  for (const entry of entries) {
    dist.set(entry.new_genre, (dist.get(entry.new_genre) ?? 0) + 1);
  }
  console.log("\nApplied genre distribution:");
  const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [genre, count] of sorted) {
    console.log(`  ${genre}: ${count}`);
  }
}

// --- Generate Mode ---

async function generateReviewFile(): Promise<void> {
  console.log("MoodLib Genre Reclassification\n");

  const books = await fetchBooksForClassification();

  let booksToProcess = books;
  if (limit && limit > 0) {
    booksToProcess = booksToProcess.slice(0, limit);
  }

  const totalBatches = Math.ceil(booksToProcess.length / BATCH_SIZE);

  console.log(`  Mode: ${dryRun ? "dry-run" : "generate"} | Model: ${MODEL}`);
  console.log(`  Books: ${booksToProcess.length} | Batches: ${totalBatches} (${BATCH_SIZE} per batch)`);
  console.log(`  Output: ${outputFile}`);
  if (force) console.log("  --force: will re-classify ALL books");
  console.log();

  if (booksToProcess.length === 0) {
    console.log("No books to classify.");
    return;
  }

  if (dryRun) {
    // Show breakdown of what would be processed
    const nullCount = booksToProcess.filter((b) => !b.genre).length;
    const fictionCount = booksToProcess.filter((b) => b.genre === "Fiction").length;
    const otherCount = booksToProcess.length - nullCount - fictionCount;
    console.log(`  Breakdown: ${fictionCount} "Fiction", ${nullCount} NULL, ${otherCount} junk/dropped genres`);
    console.log();

    // Show first batch prompt
    const firstBatch = booksToProcess.slice(0, BATCH_SIZE);
    const userPrompt = buildUserPrompt(firstBatch);
    console.log("--- System Prompt ---");
    console.log(SYSTEM_PROMPT.slice(0, 800) + "...");
    console.log();
    console.log("--- User Prompt (batch 1) ---");
    console.log(userPrompt.slice(0, 1500) + (userPrompt.length > 1500 ? "..." : ""));
    console.log();
    console.log(
      `Estimated input: ~${Math.ceil((SYSTEM_PROMPT.length + userPrompt.length) / 4)} tokens per batch`,
    );
    console.log("Dry run complete.");
    return;
  }

  // Process batches
  console.log("Processing...");
  const allResults: ReviewEntry[] = [];
  let totalErrors = 0;

  for (let i = 0; i < booksToProcess.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = booksToProcess.slice(i, i + BATCH_SIZE);
    const batchIds = new Set(batch.map((b) => b.id));
    const bookMap = new Map(batch.map((b) => [b.id, b]));
    const userPrompt = buildUserPrompt(batch);

    let results: GenreResult[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
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
      for (const result of results) {
        const book = bookMap.get(result.id);
        if (book) {
          allResults.push({
            id: result.id,
            title: book.title,
            author: book.author,
            old_genre: book.genre,
            new_genre: result.genre,
          });
        }
      }

      // Count genres in this batch
      const genreCounts = new Map<string, number>();
      for (const r of results) {
        genreCounts.set(r.genre, (genreCounts.get(r.genre) ?? 0) + 1);
      }
      const summary = [...genreCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g, c]) => `${g}:${c}`)
        .join(", ");

      console.log(
        `  [${String(batchNum).padStart(3)}/${totalBatches}] \u2713 ${results.length} classified (${summary})`,
      );
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < booksToProcess.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Sort by new_genre then title
  allResults.sort((a, b) => {
    const genreCompare = a.new_genre.localeCompare(b.new_genre);
    if (genreCompare !== 0) return genreCompare;
    return a.title.localeCompare(b.title);
  });

  // Write review file
  writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

  // Distribution summary
  const dist = new Map<string, number>();
  for (const entry of allResults) {
    dist.set(entry.new_genre, (dist.get(entry.new_genre) ?? 0) + 1);
  }

  console.log(
    `\nDone: ${booksToProcess.length} books processed, ${allResults.length} classified, ${totalErrors} error${totalErrors !== 1 ? "s" : ""}`,
  );
  console.log(`Review file: ${outputFile}`);
  console.log("\nGenre distribution:");
  const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [genre, count] of sorted) {
    console.log(`  ${genre}: ${count}`);
  }
  console.log(`\nReview the file, then apply: npx tsx scripts/reclassify-genres.ts --apply ${outputFile}`);
}

// --- Main ---

async function main() {
  if (applyFile) {
    await applyReviewFile(applyFile);
  } else {
    await generateReviewFile();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
