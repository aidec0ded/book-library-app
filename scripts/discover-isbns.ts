import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import path from "path";
import { config } from "dotenv";
import {
  baseTitle,
  findMatchingEditions,
  pickBestEdition,
  type ISBNdbBook,
} from "../src/lib/editions.js";

import { backgroundBudget, isbndbSearch } from "../server/isbndb.js";

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
const autoMode = args.includes("--auto");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---


// --- Helpers ---



// --- Main ---

async function main() {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    console.error("ISBNDB_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log("Rekollekt ISBN Discovery");

  // Step 1: Fetch books without ISBNs
  let query = supabase
    .from("books")
    .select("id, title, author")
    .is("isbn", null)
    .order("title");

  // In auto mode, only search books that haven't been through discovery yet
  if (autoMode) {
    query = query.is("isbndb_enriched_at", null);
  }

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

  // Each search is one call; leave the reserve for readers' own searches
  const budget = await backgroundBudget();
  if (!dryRun && budget < candidates.length) {
    if (budget === 0) {
      console.log("ISBNdb quota is down to the reserve for readers; searching again after it resets.");
      return;
    }
    candidates = candidates.slice(0, budget);
  }

  // Step 2: Search ISBNdb for each book
  let matched = 0;
  let skipped = 0;
  let errors = 0;
  const reviewEntries: ReviewEntry[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const book = candidates[i];
    const progress = `[${String(i + 1).padStart(String(candidates.length).length)}/${candidates.length}]`;
    const searchQuery = baseTitle(book.title);

    try {
      // One call however many results; every result goes into the shared cache
      const response = (await isbndbSearch(
        `/books/${encodeURIComponent(searchQuery)}?page=1&pageSize=100&column=title`,
      )) as ISBNdbSearchResponse | null;

      if (!response || !response.books || response.books.length === 0) {
        console.log(`  ${progress} ? ${book.title} — ${book.author} (no results)`);
        skipped++;
        if (autoMode && !dryRun) {
          // Mark as searched so scheduler doesn't retry
          await supabase.from("books").update({ isbndb_enriched_at: new Date().toISOString() }).eq("id", book.id);
        }
        if (!autoMode) {
          reviewEntries.push({
            id: book.id,
            title: book.title,
            author: book.author,
            results: [],
          });
        }
      } else {
        // Step 3: Pick the likeliest edition among those matching title and author
        const bestMatch = pickBestEdition(
          findMatchingEditions(book.title, book.author, response.books),
          "en",
        );

        if (bestMatch) {
          const isbn = bestMatch.isbn13 || bestMatch.isbn || null;

          if (!isbn) {
            console.log(
              `  ${progress} ? ${book.title} — ${book.author} (match found but no ISBN)`
            );
            skipped++;
            if (autoMode && !dryRun) {
              await supabase.from("books").update({ isbndb_enriched_at: new Date().toISOString() }).eq("id", book.id);
            }
            if (!autoMode) {
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
          if (autoMode && !dryRun) {
            await supabase.from("books").update({ isbndb_enriched_at: new Date().toISOString() }).eq("id", book.id);
          }
          if (!autoMode) {
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
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ${progress} ✗ ${book.title} — ${errMsg}`);
      errors++;
    }

    // Rate limiting between requests
    if (i < candidates.length - 1) {
      // isbndbFetch paces requests itself
    }
  }

  // Step 5: Write review file (manual mode only)
  if (!autoMode) {
    const reviewPath = path.resolve(
      import.meta.dirname,
      "..",
      "isbn-discovery-review.json"
    );
    writeFileSync(reviewPath, JSON.stringify(reviewEntries, null, 2));
    console.log(`\n  Review file: ${reviewPath}`);
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`  Total processed: ${candidates.length}`);
  console.log(`  Auto-matched:    ${matched}`);
  console.log(`  Skipped:         ${skipped}`);
  console.log(`  Errors:          ${errors}`);

  if (dryRun) {
    console.log("\n  Dry run — no ISBNs were written to the database.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
