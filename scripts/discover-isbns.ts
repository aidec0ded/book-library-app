import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import path from "path";
import { config } from "dotenv";

config();

// --- Supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Types ---

interface BookCandidate {
  id: string;
  title: string;
  author: string;
}

interface ISBNdbBook {
  title: string;
  title_long?: string;
  isbn?: string;
  isbn13?: string;
  authors?: string[];
}

interface ISBNdbSearchResponse {
  total: number;
  books: ISBNdbBook[];
}

interface ReviewEntry {
  id: string;
  title: string;
  author: string;
  results: Array<{
    title: string;
    authors: string[];
    isbn13?: string;
    isbn?: string;
  }>;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

const RATE_LIMIT_MS = 1100;
const MAX_RETRIES = 3;
const ISBNDB_BASE_URL = "https://api2.isbndb.com";

// --- Helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a title for comparison:
 * - lowercase
 * - strip leading "The ", "A ", "An "
 * - & → and
 * - strip parenthetical suffixes like "(The Southern Reach Trilogy)"
 * - strip punctuation
 * - collapse whitespace
 */
function normalizeTitle(title: string): string {
  let t = title.toLowerCase().trim();
  // strip leading articles
  t = t.replace(/^(the|a|an)\s+/i, "");
  // & → and
  t = t.replace(/&/g, "and");
  // strip parenthetical suffixes
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  // strip punctuation (keep alphanumeric and spaces)
  t = t.replace(/[^\w\s]/g, "");
  // collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * Extract the last name from an author string.
 * Handles "First Last", "First M. Last", etc.
 */
function extractLastName(author: string): string {
  const name = author.toLowerCase().trim();
  const parts = name.split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Normalize an author field for comparison:
 * - split on " & " or ", " to get first author
 * - extract last name
 */
function normalizeAuthor(author: string): string {
  // split on common multi-author delimiters, take first
  const first = author.split(/\s+&\s+|,\s*/)[0].trim();
  return extractLastName(first);
}

/**
 * Check if an author last name matches any of the ISBNdb result authors.
 */
function authorLastNameMatches(
  bookAuthorLastName: string,
  resultAuthors: string[]
): boolean {
  return resultAuthors.some((a) => {
    const resultLast = extractLastName(a);
    return resultLast === bookAuthorLastName;
  });
}

async function searchISBNdb(
  query: string,
  apiKey: string
): Promise<ISBNdbSearchResponse | null> {
  const encoded = encodeURIComponent(query);
  const url = `${ISBNDB_BASE_URL}/books/${encoded}?page=1&pageSize=5`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: apiKey },
      });

      if (res.status === 404) {
        return null;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.log(
            `    Retry ${attempt}/${MAX_RETRIES} (HTTP ${res.status}, waiting ${backoff}ms)`
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} after ${MAX_RETRIES} retries`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return (await res.json()) as ISBNdbSearchResponse;
    } catch (err) {
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        const backoff = 1000 * Math.pow(2, attempt - 1);
        console.log(
          `    Retry ${attempt}/${MAX_RETRIES} (network error, waiting ${backoff}ms)`
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  return null;
}

// --- Main ---

async function main() {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    console.error("ISBNDB_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log("MoodLib ISBN Discovery");

  // Step 1: Fetch books without ISBNs
  let query = supabase
    .from("books")
    .select("id, title, author")
    .is("isbn", null)
    .order("title");

  const { data: books, error: fetchError } = await query;

  if (fetchError) {
    console.error("Failed to fetch books:", fetchError.message);
    process.exit(1);
  }

  let candidates: BookCandidate[] = (books ?? []) as BookCandidate[];

  if (limit && limit > 0) {
    candidates = candidates.slice(0, limit);
  }

  console.log(
    `  Mode: ${dryRun ? "dry-run" : "live"} | Books without ISBN: ${candidates.length}`
  );
  console.log();

  if (candidates.length === 0) {
    console.log("No books without ISBNs found.");
    return;
  }

  // Step 2: Search ISBNdb for each book
  let matched = 0;
  let skipped = 0;
  let errors = 0;
  const reviewEntries: ReviewEntry[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const book = candidates[i];
    const progress = `[${String(i + 1).padStart(String(candidates.length).length)}/${candidates.length}]`;
    const searchQuery = `${book.title} ${book.author}`;

    try {
      const response = await searchISBNdb(searchQuery, apiKey);

      if (!response || !response.books || response.books.length === 0) {
        console.log(`  ${progress} ? ${book.title} — ${book.author} (no results)`);
        skipped++;
        reviewEntries.push({
          id: book.id,
          title: book.title,
          author: book.author,
          results: [],
        });
      } else {
        // Step 3: Score results for match confidence
        const normalizedBookTitle = normalizeTitle(book.title);
        const bookAuthorLastName = normalizeAuthor(book.author);

        let bestMatch: ISBNdbBook | null = null;

        for (const result of response.books) {
          const normalizedResultTitle = normalizeTitle(result.title);
          const titleMatch = normalizedBookTitle === normalizedResultTitle;
          const authorMatch = authorLastNameMatches(
            bookAuthorLastName,
            result.authors ?? []
          );

          if (titleMatch && authorMatch) {
            bestMatch = result;
            break;
          }
        }

        if (bestMatch) {
          const isbn = bestMatch.isbn13 || bestMatch.isbn || null;

          if (!isbn) {
            console.log(
              `  ${progress} ? ${book.title} — ${book.author} (match found but no ISBN)`
            );
            skipped++;
            reviewEntries.push({
              id: book.id,
              title: book.title,
              author: book.author,
              results: response.books.slice(0, 3).map((b) => ({
                title: b.title,
                authors: b.authors ?? [],
                isbn13: b.isbn13,
                isbn: b.isbn,
              })),
            });
          } else {
            // Step 4: Update Supabase
            if (!dryRun) {
              const { error: updateError } = await supabase
                .from("books")
                .update({ isbn })
                .eq("id", book.id);

              if (updateError) {
                console.log(
                  `  ${progress} ✗ ${book.title} — DB error: ${updateError.message}`
                );
                errors++;
              } else {
                console.log(
                  `  ${progress} ✓ ${book.title} — ${book.author} → ${isbn}`
                );
                matched++;
              }
            } else {
              console.log(
                `  ${progress} ✓ ${book.title} — ${book.author} → ${isbn} (dry-run)`
              );
              matched++;
            }
          }
        } else {
          console.log(
            `  ${progress} ? ${book.title} — ${book.author} (no confident match)`
          );
          skipped++;
          reviewEntries.push({
            id: book.id,
            title: book.title,
            author: book.author,
            results: response.books.slice(0, 3).map((b) => ({
              title: b.title,
              authors: b.authors ?? [],
              isbn13: b.isbn13,
              isbn: b.isbn,
            })),
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ${progress} ✗ ${book.title} — ${errMsg}`);
      errors++;
    }

    // Rate limiting between requests
    if (i < candidates.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Step 5: Write review file
  const reviewPath = path.resolve(
    import.meta.dirname,
    "..",
    "isbn-discovery-review.json"
  );
  writeFileSync(reviewPath, JSON.stringify(reviewEntries, null, 2));

  // Summary
  console.log("\n--- Summary ---");
  console.log(`  Total processed: ${candidates.length}`);
  console.log(`  Auto-matched:    ${matched}`);
  console.log(`  Skipped:         ${skipped}`);
  console.log(`  Errors:          ${errors}`);
  console.log(`\n  Review file: ${reviewPath}`);

  if (dryRun) {
    console.log("\n  Dry run — no ISBNs were written to the database.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
