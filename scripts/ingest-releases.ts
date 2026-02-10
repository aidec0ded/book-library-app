import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

// --- Supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Types ---

interface ISBNdbSearchResponse {
  total: number;
  books: ISBNdbBook[];
}

interface ISBNdbBook {
  isbn13?: string;
  isbn10?: string;
  isbn?: string;
  title?: string;
  title_long?: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
  image?: string;
  synopsis?: string;
  overview?: string;
  subjects?: string[];
  binding?: string;
  pages?: number;
  language?: string;
  edition?: string;
}

interface NewReleaseRow {
  isbn13: string;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  date_published: string | null;
  pub_year: number | null;
  pub_month: number | null;
  cover_image_url: string | null;
  synopsis: string | null;
  subjects: string[];
  binding: string | null;
  page_count: number | null;
  language: string | null;
  edition: string | null;
  source: string;
  is_fiction: boolean | null;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const monthIdx = args.indexOf("--month");
const singleMonth = monthIdx !== -1 ? args[monthIdx + 1] : null;
const monthsIdx = args.indexOf("--months");
const monthsWindow = monthsIdx !== -1 ? parseInt(args[monthsIdx + 1], 10) : 3;
const langIdx = args.indexOf("--language");
const filterLanguage = langIdx !== -1 ? args[langIdx + 1] : null;
const editionIdx = args.indexOf("--edition");
const filterEdition = editionIdx !== -1;
const bindingIdx = args.indexOf("--binding");
const filterBinding = bindingIdx !== -1 ? args[bindingIdx + 1] : null;
const filterFiction = args.includes("--fiction");

// --- Constants ---

const RATE_LIMIT_MS = 1100;
const MAX_RETRIES = 3;
const MAX_PAGES_PER_MONTH = 10;
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;
const ISBNDB_BASE_URL = "https://api2.isbndb.com";

// --- Helpers ---

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePubDate(dateStr: string): { year: number | null; month: number | null } {
  // Try YYYY-MM-DD or YYYY-MM
  const dashMatch = dateStr.match(/^(\d{4})-(\d{2})/);
  if (dashMatch) {
    const year = parseInt(dashMatch[1], 10);
    const month = parseInt(dashMatch[2], 10);
    return { year, month: month >= 1 && month <= 12 ? month : null };
  }
  // Try just YYYY
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch) {
    return { year: parseInt(yearMatch[1], 10), month: null };
  }
  return { year: null, month: null };
}

function getMonthRange(): { year: number; month: number }[] {
  if (singleMonth) {
    const [y, m] = singleMonth.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) {
      console.error(`Invalid --month format: ${singleMonth} (expected YYYY-MM)`);
      process.exit(1);
    }
    return [{ year: y, month: m }];
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  // Center the window on current month
  const offset = Math.floor((monthsWindow - 1) / 2);
  const months: { year: number; month: number }[] = [];

  for (let i = -offset; i < monthsWindow - offset; i++) {
    let m = currentMonth + i;
    let y = currentYear;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    months.push({ year: y, month: m });
  }

  return months;
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

async function fetchISBNdbSearch(
  query: string,
  page: number,
  apiKey: string
): Promise<ISBNdbSearchResponse | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${ISBNDB_BASE_URL}/books/${encodeURIComponent(query)}?column=date_published&page=${page}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(url, {
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

      return (await res.json()) as ISBNdbSearchResponse;
    } catch (err) {
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
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

const FICTION_SUBJECT_RE = /fiction|novel|thriller|mystery|romance|fantasy|sci-fi|science fiction|literary|horror|suspense|detective|adventure/i;

function isFirstEdition(edition: string): boolean {
  const lower = edition.toLowerCase();
  return /\b(1st|first)\b/.test(lower);
}

function passesFilters(book: ISBNdbBook, targetYear: number, targetMonth: number): boolean {
  if (filterLanguage) {
    const lang = book.language?.trim().toLowerCase();
    if (!lang) return false;
    const target = filterLanguage.toLowerCase();
    if (lang !== target && !lang.startsWith(target)) return false;
  }
  if (filterEdition) {
    const edition = book.edition?.trim();
    if (!edition || !isFirstEdition(edition)) return false;
  }
  if (filterBinding) {
    const binding = book.binding?.trim().toLowerCase();
    if (!binding) return false;
    if (binding !== filterBinding.toLowerCase()) return false;
  }
  if (filterFiction) {
    if (!book.subjects || !book.subjects.some((s) => FICTION_SUBJECT_RE.test(s))) return false;
  }
  // Reject books without a parseable publication date — we need a month to categorize them
  if (!book.date_published) return false;
  const { year: parsedYear, month: parsedMonth } = parsePubDate(book.date_published);
  // Must have a parseable month to be useful as a new release
  if (parsedMonth == null) return false;
  if (parsedMonth !== targetMonth) return false;
  if (parsedYear != null && parsedYear !== targetYear) return false;
  return true;
}

const hasAnyFilter = !!(filterLanguage || filterEdition || filterBinding || filterFiction);

function mapToRow(book: ISBNdbBook): NewReleaseRow | null {
  const isbn13 = book.isbn13 || book.isbn;
  if (!isbn13) return null;

  const title = book.title_long || book.title;
  if (!title) return null;

  const { year, month } = book.date_published
    ? parsePubDate(book.date_published)
    : { year: null, month: null };

  const synopsis = book.synopsis
    ? stripHtml(book.synopsis)
    : book.overview
      ? stripHtml(book.overview)
      : null;

  return {
    isbn13,
    isbn10: book.isbn10 || null,
    title,
    authors: book.authors ?? [],
    publisher: book.publisher?.trim() || null,
    date_published: book.date_published || null,
    pub_year: year,
    pub_month: month,
    cover_image_url: book.image || null,
    synopsis: synopsis || null,
    subjects: book.subjects ?? [],
    binding: book.binding?.trim() || null,
    page_count: book.pages && book.pages > 0 ? book.pages : null,
    language: book.language?.trim() || null,
    edition: book.edition?.trim() || null,
    source: "isbndb",
    is_fiction: (book.subjects ?? []).some((s) => FICTION_SUBJECT_RE.test(s)) ? true : false,
  };
}

// --- Main ---

async function main() {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    console.error("ISBNDB_API_KEY environment variable is required");
    process.exit(1);
  }

  const months = getMonthRange();

  console.log("Rekollekt New Releases Ingestion");
  console.log(`  Mode: ${dryRun ? "dry-run" : "live"}`);
  console.log(`  Months: ${months.map((m) => formatMonthLabel(m.year, m.month)).join(", ")}`);
  if (filterLanguage) console.log(`  Language filter: ${filterLanguage}`);
  if (filterBinding) console.log(`  Binding filter: ${filterBinding}`);
  if (filterFiction) console.log(`  Fiction filter: subjects matching fiction genres`);
  if (filterEdition) console.log(`  Edition filter: first/1st editions only`);
  if (limit) console.log(`  Limit: ${limit} releases`);
  console.log();

  let totalApiCalls = 0;
  let totalResults = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;
  let totalFiltered = 0;
  let totalErrors = 0;
  let hitLimit = false;

  const allRows: NewReleaseRow[] = [];

  for (const { year, month } of months) {
    if (hitLimit) break;

    const query = formatMonth(year, month);
    const label = formatMonthLabel(year, month);
    process.stdout.write(`Fetching releases for ${label}...`);

    let monthResults = 0;
    let pageNum = 1;

    while (pageNum <= MAX_PAGES_PER_MONTH) {
      if (hitLimit) break;

      if (!dryRun) {
        totalApiCalls++;
        const response = await fetchISBNdbSearch(query, pageNum, apiKey);

        if (!response || !response.books || response.books.length === 0) {
          break;
        }

        for (const book of response.books) {
          if (!passesFilters(book, year, month)) {
            totalFiltered++;
            continue;
          }
          const row = mapToRow(book);
          if (row) {
            allRows.push(row);
            if (limit && allRows.length >= limit) {
              hitLimit = true;
              break;
            }
          } else {
            totalSkipped++;
          }
        }

        monthResults += response.books.length;

        // Check if we've fetched all results
        if (response.books.length < PAGE_SIZE) {
          break;
        }

        // Rate limit between pages
        await sleep(RATE_LIMIT_MS);
      } else if (hasAnyFilter) {
        // Dry run with filters: must fetch all pages to count post-filter
        totalApiCalls++;
        const response = await fetchISBNdbSearch(query, pageNum, apiKey);

        if (!response || !response.books || response.books.length === 0) {
          break;
        }

        for (const book of response.books) {
          if (!passesFilters(book, year, month)) {
            totalFiltered++;
            continue;
          }
          const row = mapToRow(book);
          if (row) {
            allRows.push(row);
          } else {
            totalSkipped++;
          }
        }

        monthResults += response.books.length;

        if (response.books.length < PAGE_SIZE) {
          break;
        }

        await sleep(RATE_LIMIT_MS);
      } else {
        // Dry run without filters: single page probe for total count
        totalApiCalls++;
        const response = await fetchISBNdbSearch(query, 1, apiKey);
        if (response) {
          monthResults = response.total;
          totalApiCalls += Math.min(Math.ceil(response.total / PAGE_SIZE), MAX_PAGES_PER_MONTH) - 1;
        }
        await sleep(RATE_LIMIT_MS);
        break;
      }

      pageNum++;
    }

    const pages = dryRun
      ? Math.min(Math.ceil(monthResults / PAGE_SIZE), MAX_PAGES_PER_MONTH)
      : pageNum - 1;
    console.log(` ${monthResults.toLocaleString()} results (${pages} page${pages !== 1 ? "s" : ""})`);
    totalResults += monthResults;
  }

  if (dryRun) {
    console.log(`\n--- Dry Run Summary ---`);
    console.log(`  Months: ${months.length} | API calls: ${hasAnyFilter ? "" : "~"}${totalApiCalls} | Total results: ${hasAnyFilter ? "" : "~"}${totalResults.toLocaleString()}`);
    if (hasAnyFilter) {
      // Deduplicate to get accurate count
      const deduped = new Map<string, NewReleaseRow>();
      for (const row of allRows) {
        deduped.set(row.isbn13, row);
      }
      console.log(`  After filters: ${deduped.size.toLocaleString()} unique releases | Filtered out: ${totalFiltered.toLocaleString()} | Skipped (no ISBN13): ${totalSkipped}`);
    }
    console.log(`\nDry run complete. No database writes.`);
    return;
  }

  // Deduplicate by isbn13 (keep last occurrence)
  const deduped = new Map<string, NewReleaseRow>();
  for (const row of allRows) {
    deduped.set(row.isbn13, row);
  }
  const rows = Array.from(deduped.values());

  const filterNote = totalFiltered > 0 ? ` | ${totalFiltered.toLocaleString()} filtered out` : "";
  console.log(`\nProcessed ${rows.length} unique releases from ${totalResults.toLocaleString()} results (${totalSkipped} skipped, no ISBN13${filterNote})`);

  // Batch upsert
  if (rows.length > 0) {
    process.stdout.write(`Upserting to database...`);

    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from("new_releases")
        .upsert(batch, { onConflict: "isbn13" });

      if (error) {
        console.error(`\n  Batch error (rows ${i}-${i + batch.length}): ${error.message}`);
        totalErrors++;
      } else {
        totalUpserted += batch.length;
      }
    }

    console.log(` done`);
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`  Months: ${months.length} | API calls: ${totalApiCalls} | Total: ${totalResults.toLocaleString()}`);
  console.log(`  Upserted: ${totalUpserted.toLocaleString()} | Skipped (no ISBN13): ${totalSkipped} | Filtered: ${totalFiltered.toLocaleString()} | Errors: ${totalErrors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
