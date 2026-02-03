import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

// --- Supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Types ---

interface BookForEnrichment {
  id: string;
  title: string;
  author: string;
  isbn: string;
  summary: string | null;
}

interface ISBNdbBookResponse {
  book: {
    image?: string;
    pages?: number;
    publisher?: string;
    date_published?: string;
    binding?: string;
    synopsis?: string;
    overview?: string;
  };
}

interface UpdateFields {
  cover_image_url?: string;
  summary?: string;
  page_count?: number;
  publisher?: string;
  publication_year?: number;
  format?: string;
  isbndb_enriched_at: string;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

const RATE_LIMIT_MS = 1100;
const MAX_RETRIES = 3;
const ISBNDB_BASE_URL = "https://api2.isbndb.com";

// --- Helpers ---

function parseYear(dateStr: string): number | null {
  const match = dateStr.match(/((?:19|20)\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchISBNdb(
  isbn: string,
  apiKey: string
): Promise<ISBNdbBookResponse | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${ISBNDB_BASE_URL}/book/${isbn}`, {
        headers: { Authorization: apiKey },
      });

      if (res.status === 404) {
        return null;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.log(`    Retry ${attempt}/${MAX_RETRIES} (HTTP ${res.status}, waiting ${backoff}ms)`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} after ${MAX_RETRIES} retries`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return (await res.json()) as ISBNdbBookResponse;
    } catch (err) {
      if (
        err instanceof TypeError &&
        attempt < MAX_RETRIES
      ) {
        // Network error — retry
        const backoff = 1000 * Math.pow(2, attempt - 1);
        console.log(`    Retry ${attempt}/${MAX_RETRIES} (network error, waiting ${backoff}ms)`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  return null;
}

function buildUpdate(
  data: ISBNdbBookResponse,
  existingSummary: string | null
): UpdateFields {
  const book = data.book;
  const update: UpdateFields = {
    isbndb_enriched_at: new Date().toISOString(),
  };

  if (book.image) {
    update.cover_image_url = book.image;
  }

  if (existingSummary === null) {
    const synopsis = book.synopsis ? stripHtml(book.synopsis).trim() : "";
    const overview = book.overview ? stripHtml(book.overview).trim() : "";
    const text = synopsis || overview;
    if (text) {
      update.summary = text;
    }
  }

  if (book.pages && book.pages > 0) {
    update.page_count = book.pages;
  }

  if (book.publisher) {
    const trimmed = book.publisher.trim();
    if (trimmed) update.publisher = trimmed;
  }

  if (book.date_published) {
    const year = parseYear(book.date_published);
    if (year) update.publication_year = year;
  }

  if (book.binding) {
    const trimmed = book.binding.trim();
    if (trimmed) update.format = trimmed;
  }

  return update;
}

// --- Main ---

async function main() {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    console.error("ISBNDB_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log("MoodLib ISBNdb Enrichment");

  // Step 1: Fetch books with ISBNs
  let query = supabase
    .from("books")
    .select("id, title, author, isbn, summary")
    .not("isbn", "is", null)
    .order("title");

  if (!force) {
    query = query.is("isbndb_enriched_at", null);
  }

  const { data: books, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch books:", fetchError.message);
    process.exit(1);
  }

  let booksToEnrich: BookForEnrichment[] = (books ?? []) as BookForEnrichment[];

  if (limit && limit > 0) {
    booksToEnrich = booksToEnrich.slice(0, limit);
  }

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Books: ${booksToEnrich.length}`
  );
  if (force) console.log("  --force: will re-enrich previously enriched books");
  console.log();

  if (booksToEnrich.length === 0) {
    console.log("No books to enrich.");
    return;
  }

  if (dryRun) {
    for (const book of booksToEnrich) {
      console.log(`  ${book.isbn}  ${book.title} — ${book.author}`);
    }
    console.log(`\nDry run complete. ${booksToEnrich.length} books would be enriched.`);
    return;
  }

  // Step 2: Process books one at a time
  let enriched = 0;
  let notFound = 0;
  let errors = 0;
  const fieldCounts: Record<string, number> = {
    cover_image_url: 0,
    summary: 0,
    page_count: 0,
    publisher: 0,
    publication_year: 0,
    format: 0,
  };

  for (let i = 0; i < booksToEnrich.length; i++) {
    const book = booksToEnrich[i];
    const progress = `[${String(i + 1).padStart(String(booksToEnrich.length).length)}/${booksToEnrich.length}]`;

    try {
      const data = await fetchISBNdb(book.isbn, apiKey);

      if (!data) {
        // Not found in ISBNdb — mark as enriched so we don't retry
        await supabase
          .from("books")
          .update({ isbndb_enriched_at: new Date().toISOString() })
          .eq("id", book.id);
        console.log(`  ${progress} — ${book.title} (not in ISBNdb)`);
        notFound++;
      } else {
        const update = buildUpdate(data, book.summary);
        const { error: updateError } = await supabase
          .from("books")
          .update(update)
          .eq("id", book.id);

        if (updateError) {
          console.log(`  ${progress} ✗ ${book.title} — DB error: ${updateError.message}`);
          errors++;
        } else {
          // Count which fields were populated
          for (const key of Object.keys(fieldCounts)) {
            if (update[key as keyof UpdateFields] !== undefined) {
              fieldCounts[key]++;
            }
          }
          const fields = Object.keys(update).filter(
            (k) => k !== "isbndb_enriched_at"
          );
          console.log(
            `  ${progress} ✓ ${book.title} (${fields.join(", ") || "timestamp only"})`
          );
          enriched++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ${progress} ✗ ${book.title} — ${errMsg}`);
      errors++;
    }

    // Rate limiting between requests
    if (i < booksToEnrich.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`  Total processed: ${booksToEnrich.length}`);
  console.log(`  Enriched:        ${enriched}`);
  console.log(`  Not in ISBNdb:   ${notFound}`);
  console.log(`  Errors:          ${errors}`);
  console.log();
  console.log("  Fields populated:");
  for (const [field, count] of Object.entries(fieldCounts)) {
    if (count > 0) {
      console.log(`    ${field}: ${count}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
