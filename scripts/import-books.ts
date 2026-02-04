import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { config } from "dotenv";
import path from "path";

config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Types ---

interface BookRow {
  title: string;
  subtitle: string | null;
  series: string | null;
  volume: string | null;
  author: string;
  isbn: string | null;
  google_volume_id: string | null;
  genre: string | null;
  summary: string | null;
  category: string | null;
  status: string | null;
  date_started: string | null;
  date_finished: string | null;
  rating: number | null;
  is_favorite: boolean;
  is_up_next: boolean;
  notes: string | null;
  cover_image_url: string | null;
  timing_month: number | null;
  timing_position: string | null;
  timing_raw: string | null;
}

interface TimingResult {
  timing_month: number | null;
  timing_position: "early" | "mid" | "late" | null;
  timing_raw: string;
}

// --- Constants ---

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// --- Title Normalization ---

function normalizeTitle(title: string): string {
  // Catalog format: "Da Vinci Code, The" -> "The Da Vinci Code"
  // Safe for titles with internal commas like "1,000 Places to See Before You Die"
  // because regex checks that the word after the LAST comma is strictly an article.
  const match = title.match(/^(.+),\s+(The|A|An)$/i);
  if (match) {
    return `${match[2]} ${match[1]}`;
  }
  return title;
}

// --- Match Key ---

function makeMatchKey(title: string, author: string): string {
  const normTitle = normalizeTitle(title.trim());
  return (
    normTitle
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // smart quotes -> ASCII
      .replace(/[?!.]/g, "") // strip trailing punctuation + periods (A.J. vs A. J.)
    + "|" +
    author
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, "") // strip parenthetical like "(as Richard Bachman)"
      .split(",")[0] // take first author when catalog has "King, Stephen,Bachman, Richard"
      .trim()
  );
}

// --- "When to Read" Parser (5 tiers) ---

function parseWhenToRead(raw: string): TimingResult {
  const trimmed = raw.trim();
  if (!trimmed) return { timing_month: null, timing_position: null, timing_raw: "" };

  const result: TimingResult = {
    timing_month: null,
    timing_position: null,
    timing_raw: trimmed,
  };

  const oddballMap: Record<string, { position: "early" | "mid" | "late" }> = {
    halloween: { position: "late" },
    "thanksgiving week": { position: "late" },
    "first half": { position: "early" },
    "last two weeks": { position: "late" },
  };

  // Tier 1: Clean — "Month (position)"
  const cleanMatch = trimmed.match(/^(\w+)\s*\((early|mid|late)\)$/i);
  if (cleanMatch) {
    result.timing_month = MONTH_MAP[cleanMatch[1].toLowerCase()] ?? null;
    result.timing_position = cleanMatch[2].toLowerCase() as "early" | "mid" | "late";
    return result;
  }

  // Tier 2: Range — "Month (X to Y)" -> take first position
  // Also catches cross-month ranges like "May (late to early June)"
  const rangeMatch = trimmed.match(/^(\w+)\s*\((\w+)\s+to\s+\w+.*\)$/i);
  if (rangeMatch) {
    result.timing_month = MONTH_MAP[rangeMatch[1].toLowerCase()] ?? null;
    const firstPos = rangeMatch[2].toLowerCase();
    if (["early", "mid", "late"].includes(firstPos)) {
      result.timing_position = firstPos as "early" | "mid" | "late";
    }
    return result;
  }

  // Tier 3: Oddball — "Month (Halloween)", "October (last two weeks)", etc.
  const oddballMatch = trimmed.match(/^(\w+)\s*\((.+)\)$/i);
  if (oddballMatch) {
    result.timing_month = MONTH_MAP[oddballMatch[1].toLowerCase()] ?? null;
    const inner = oddballMatch[2].toLowerCase().trim();
    if (oddballMap[inner]) {
      result.timing_position = oddballMap[inner].position;
    }
    return result;
  }

  // Tier 4: Cross-month — "August into September"
  const crossMatch = trimmed.match(/^(\w+)\s+into\s+\w+/i);
  if (crossMatch) {
    result.timing_month = MONTH_MAP[crossMatch[1].toLowerCase()] ?? null;
    return result;
  }

  // Tier 5: Month only — "August"
  const monthOnly = MONTH_MAP[trimmed.toLowerCase()];
  if (monthOnly) {
    result.timing_month = monthOnly;
    return result;
  }

  console.warn(`[WARN] Could not parse When to Read: "${trimmed}"`);
  return result;
}

// --- Field Mappers ---

function mapStatus(raw: string): string | null {
  const map: Record<string, string> = {
    read: "read",
    unread: "unread",
    reading: "reading",
    unfinished: "unfinished",
  };
  return map[raw.trim().toLowerCase()] ?? null;
}

function mapRating(raw: string): number | null {
  const num = parseFloat(raw);
  if (isNaN(num) || num === 0) return null; // 0.000000 means unrated
  return Math.round(num * 2) / 2; // round to nearest 0.5
}

function mapDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function mapBoolean(raw: string): boolean {
  return raw.trim() === "1";
}

// --- CSV Processing ---

function processCatalog(csvPath: string): Map<string, BookRow> {
  const raw = readFileSync(csvPath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true });

  const bookMap = new Map<string, BookRow>();

  for (const row of records) {
    const title = normalizeTitle(row["Title"]?.trim() ?? "");
    const author = row["Author"]?.trim() ?? "";
    const key = makeMatchKey(row["Title"] ?? "", author);

    const book: BookRow = {
      title,
      subtitle: row["Subtitle"]?.trim() || null,
      series: row["Series"]?.trim() || null,
      volume: row["Volume"]?.trim() || null,
      author,
      isbn: row["ISBN"]?.trim() || null,
      google_volume_id: row["Google VolumeID"]?.trim() || null,
      genre: row["Genre"]?.trim() || null,
      summary: row["Summary"]?.trim() || null,
      category: row["Category"]?.trim() || null,
      status: mapStatus(row["Status"] ?? ""),
      date_started: mapDate(row["Date Started"] ?? ""),
      date_finished: mapDate(row["Date Finished"] ?? ""),
      rating: mapRating(row["Rating"] ?? ""),
      is_favorite: mapBoolean(row["Favorites"] ?? ""),
      is_up_next: mapBoolean(row["Up Next"] ?? ""),
      notes: row["Notes"]?.trim() || null,
      cover_image_url: row["Uploaded Image URL"]?.trim() || null,
      timing_month: null,
      timing_position: null,
      timing_raw: null,
    };

    bookMap.set(key, book);
  }

  return bookMap;
}

function processFictionList(
  csvPath: string,
  catalogMap: Map<string, BookRow>
): { matched: number; fictionOnly: BookRow[] } {
  const raw = readFileSync(csvPath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true });

  let matched = 0;
  const fictionOnly: BookRow[] = [];

  for (const row of records) {
    const title = row["Title"]?.trim() ?? "";
    const author = row["Author"]?.trim() ?? "";
    const key = makeMatchKey(title, author);

    const timing = parseWhenToRead(row["When to Read"] ?? "");
    const fictionNotes = row["Notes"]?.trim() || null;

    if (catalogMap.has(key)) {
      const existing = catalogMap.get(key)!;
      existing.timing_month = timing.timing_month;
      existing.timing_position = timing.timing_position;
      existing.timing_raw = timing.timing_raw || null;

      // Merge notes: catalog notes first, then fiction notes
      if (fictionNotes) {
        existing.notes = existing.notes
          ? `${existing.notes}\n\n---\n\n${fictionNotes}`
          : fictionNotes;
      }

      matched++;
    } else {
      fictionOnly.push({
        title,
        subtitle: null,
        series: null,
        volume: null,
        author,
        isbn: null,
        google_volume_id: null,
        genre: null,
        summary: null,
        category: null,
        status: "unread",
        date_started: null,
        date_finished: null,
        rating: null,
        is_favorite: false,
        is_up_next: false,
        notes: fictionNotes,
        cover_image_url: null,
        timing_month: timing.timing_month,
        timing_position: timing.timing_position,
        timing_raw: timing.timing_raw || null,
      });
    }
  }

  return { matched, fictionOnly };
}

// --- Batch Insert ---

async function batchInsert(books: BookRow[]): Promise<void> {
  const CHUNK_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < books.length; i += CHUNK_SIZE) {
    const chunk = books.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("books").insert(chunk);

    if (error) {
      console.error(
        `[ERROR] Batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`
      );
      errors += chunk.length;
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
}

// --- Main ---

async function main() {
  const rootDir = path.resolve(import.meta.dirname, "..");

  console.log("=== MoodLib Import ===\n");

  // Step 1: Process catalog
  console.log("Processing library catalog...");
  const catalogMap = processCatalog(
    path.join(rootDir, "library-catalog.csv")
  );
  console.log(`  Catalog entries: ${catalogMap.size}`);

  // Step 2: Process fiction list and merge
  console.log("Processing fiction master list...");
  const { matched, fictionOnly } = processFictionList(
    path.join(rootDir, "book-library-fiction-master-list.csv"),
    catalogMap
  );

  const catalogBooks = Array.from(catalogMap.values());
  const allBooks = [...catalogBooks, ...fictionOnly];

  // Step 3: Stats
  console.log("\n--- Import Stats ---");
  console.log(`  Catalog books:      ${catalogMap.size}`);
  console.log(`  Fiction list books:  ${matched + fictionOnly.length}`);
  console.log(`  Matched (merged):   ${matched}`);
  console.log(`  Catalog-only:       ${catalogMap.size - matched}`);
  console.log(`  Fiction-only (new): ${fictionOnly.length}`);
  console.log(`  Total to insert:    ${allBooks.length}`);

  // Step 4: Insert
  console.log("\nInserting into Supabase...");
  await batchInsert(allBooks);

  console.log("\n=== Import Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
