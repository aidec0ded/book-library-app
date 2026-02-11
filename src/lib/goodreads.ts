import { parse } from "csv-parse/browser/esm/sync";

// --- Types ---

export interface GoodreadsRow {
  Title: string;
  Author: string;
  "Additional Authors": string;
  ISBN: string;
  ISBN13: string;
  "My Rating": string;
  "Exclusive Shelf": string;
  "Date Read": string;
  "Original Publication Year": string;
  "Year Published": string;
  "Number of Pages": string;
  Publisher: string;
  Binding: string;
  "My Review": string;
  Bookshelves: string;
}

export interface ParsedGoodreadsBook {
  title: string;
  author: string;
  isbn: string | null;
  rating: number | null;
  status: string;
  date_finished: string | null;
  publication_year: number | null;
  page_count: number | null;
  publisher: string | null;
  format: string | null;
  notes: string | null;
  cover_image_url: null;
  book_type: "fiction" | "nonfiction" | "poetry";
  is_favorite: boolean;
  is_up_next: boolean;
  goodreadsShelf: string;
  bookshelves: string[];
  matchKey: string;
}

const REQUIRED_COLUMNS = ["Title", "Author", "Exclusive Shelf"];

// --- Parsing ---

export function parseGoodreadsCSV(csvText: string): GoodreadsRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const firstRow = records[0];
  const missing = REQUIRED_COLUMNS.filter((col) => !(col in firstRow));
  if (missing.length > 0) {
    throw new Error(
      `Not a valid Goodreads export. Missing columns: ${missing.join(", ")}`,
    );
  }

  return records as unknown as GoodreadsRow[];
}

// --- Field Helpers ---

export function stripGoodreadsISBN(raw: string): string | null {
  if (!raw) return null;
  // Goodreads wraps ISBNs in ="..." to prevent Excel from mangling them
  const stripped = raw.replace(/^="?|"?$/g, "").trim();
  return stripped || null;
}

export function parseGoodreadsDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Goodreads format: YYYY/MM/DD
  const match = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// --- Shelf Counts ---

export function getShelfCounts(
  rows: GoodreadsRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const shelf = (row["Exclusive Shelf"] || "").trim();
    if (shelf) {
      counts[shelf] = (counts[shelf] || 0) + 1;
    }
  }
  return counts;
}

// --- Match Key (reimplemented from scripts/import-books.ts) ---

function normalizeTitle(title: string): string {
  // "Da Vinci Code, The" → "The Da Vinci Code"
  const match = title.match(/^(.+),\s+(The|A|An)$/i);
  if (match) {
    return `${match[2]} ${match[1]}`;
  }
  return title;
}

export function makeMatchKey(title: string, author: string): string {
  const normTitle = normalizeTitle(title.trim());
  return (
    normTitle
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
      .replace(/[?!.]/g, "") +
    "|" +
    author
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, "")
      .split(",")[0]
      .trim()
  );
}

// --- Book Type Detection ---

export function detectBookTypeFromShelves(
  bookshelves: string[],
): "fiction" | "nonfiction" | "poetry" {
  const joined = bookshelves.join(" ");
  if (/\bpoetry\b|\bpoems\b|\bverse\b|\bpoet\b/i.test(joined)) {
    return "poetry";
  }
  if (
    /\bnon-?fiction\b|\bmemoir\b|\bbiograph\b|\bhistory\b|\bscience\b|\bself-help\b|\bessay\b|\btrue[- ]crime\b|\bpolitics\b|\bphilosophy\b|\bpsychology\b|\bbusiness\b|\beconomics\b/i.test(
      joined,
    )
  ) {
    return "nonfiction";
  }
  return "fiction";
}

// --- Row Mapping ---

export function mapGoodreadsRow(
  row: GoodreadsRow,
  toReadStatus: "unread" | "wishlist",
): ParsedGoodreadsBook {
  const shelf = (row["Exclusive Shelf"] || "").trim();
  let status: string;
  if (shelf === "read") status = "read";
  else if (shelf === "currently-reading") status = "reading";
  else if (shelf === "to-read") status = toReadStatus;
  else status = "unread";

  const rating = parseInt(row["My Rating"] || "0", 10);
  const isbn13 = stripGoodreadsISBN(row.ISBN13);
  const isbn = isbn13 || stripGoodreadsISBN(row.ISBN);

  const additionalAuthors = (row["Additional Authors"] || "").trim();
  const author = additionalAuthors
    ? `${row.Author.trim()}, ${additionalAuthors}`
    : row.Author.trim();

  const pubYear =
    parseInt(row["Original Publication Year"] || "", 10) ||
    parseInt(row["Year Published"] || "", 10) ||
    null;

  const pageCount = parseInt(row["Number of Pages"] || "0", 10) || null;
  const review = (row["My Review"] || "").trim();

  const bookshelves = (row.Bookshelves || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    title: row.Title.trim(),
    author,
    isbn,
    rating: rating > 0 ? rating : null,
    status,
    date_finished: parseGoodreadsDate(row["Date Read"] || ""),
    publication_year: pubYear,
    page_count: pageCount,
    publisher: (row.Publisher || "").trim() || null,
    format: (row.Binding || "").trim() || null,
    notes: review ? stripHtmlTags(review) : null,
    cover_image_url: null,
    book_type: detectBookTypeFromShelves(bookshelves),
    is_favorite: false,
    is_up_next: false,
    goodreadsShelf: shelf,
    bookshelves,
    matchKey: makeMatchKey(row.Title, row.Author),
  };
}
