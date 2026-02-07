const BASE_URL = "/api/isbndb";
const API_KEY = import.meta.env.VITE_ISBNDB_API_KEY as string;

// --- Types ---

export interface ISBNdbBook {
  title: string;
  title_long?: string;
  isbn?: string;
  isbn13?: string;
  authors?: string[];
  image?: string;
  publisher?: string;
  date_published?: string;
  binding?: string;
  pages?: number;
  synopsis?: string;
  overview?: string;
  subjects?: string[];
  language?: string;
  edition?: string;
}

interface SearchResponse {
  total: number;
  books: ISBNdbBook[];
}

interface BookResponse {
  book: ISBNdbBook;
}

export interface BookInsert {
  title: string;
  author: string;
  isbn: string | null;
  book_type: "fiction" | "nonfiction" | "poetry";
  cover_image_url: string | null;
  publisher: string | null;
  publication_year: number | null;
  page_count: number | null;
  format: string | null;
  summary: string | null;
  status: string;
  isbndb_enriched_at: string;
  is_favorite: boolean;
  is_up_next: boolean;
}

// --- Helpers ---

function parseYear(dateStr: string): number | null {
  const match = dateStr.match(/((?:19|20)\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) {
    throw new Error(`ISBNdb API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Public API ---

export function looksLikeISBN(input: string): boolean {
  const stripped = input.replace(/[-\s]/g, "");
  return /^\d{10}$/.test(stripped) || /^\d{13}$/.test(stripped);
}

export function normalizeISBN(input: string): string {
  return input.replace(/[-\s]/g, "");
}

export async function searchBooks(
  query: string,
  page = 1,
  pageSize = 20,
  column?: "author" | "title",
): Promise<{ total: number; books: ISBNdbBook[] }> {
  const encoded = encodeURIComponent(query);
  let url = `/books/${encoded}?page=${page}&pageSize=${pageSize}`;
  if (column) url += `&column=${column}`;
  const data = await apiFetch<SearchResponse>(url);
  return { total: data.total, books: data.books ?? [] };
}

export async function lookupBook(isbn: string): Promise<ISBNdbBook | null> {
  try {
    const data = await apiFetch<BookResponse>(`/book/${isbn}`);
    return data.book ?? null;
  } catch {
    return null;
  }
}

// --- Edition grouping ---

export interface EditionGroup {
  key: string;
  best: ISBNdbBook;
  editions: ISBNdbBook[];
}

function normalizeWorkKey(title: string, author?: string): string {
  let t = title.toLowerCase();
  // Remove subtitles and parentheticals
  t = t.replace(/\s*[:(\[].*$/, "").trim();
  // Strip bare genre/format suffixes ("Good Material A novel" → "Good Material")
  t = t
    .replace(
      /\s+a\s+(?:novel|memoir|novella|story|thriller|romance|mystery)(?:\s.*)?$/i,
      "",
    )
    .trim();
  // Strip trailing articles ("Great Gatsby, The" → "Great Gatsby")
  t = t.replace(/,\s*(the|a|an)$/i, "").trim();
  // Strip leading articles
  t = t.replace(/^(the|a|an)\s+/i, "").trim();
  // Remove punctuation, collapse whitespace
  t = t.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

  const a = (author ?? "unknown")
    .split(",")[0] // first author only
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return `${t}|${a}`;
}

function editionScore(book: ISBNdbBook): number {
  let score = 0;
  if (book.image) score += 10;
  if (book.synopsis || book.overview) score += 3;
  if (book.pages && book.pages > 0) score += 2;
  if (book.publisher) score += 1;
  const binding = (book.binding ?? "").toLowerCase();
  if (binding.includes("hardcover")) score += 5;
  else if (binding.includes("paperback")) score += 4;
  else if (binding.includes("ebook") || binding.includes("kindle")) score += 1;
  return score;
}

export function groupEditions(
  books: ISBNdbBook[],
  query?: string,
): EditionGroup[] {
  const groups = new Map<string, ISBNdbBook[]>();

  for (const book of books) {
    const key = normalizeWorkKey(book.title, book.authors?.[0]);
    const existing = groups.get(key);
    if (existing) {
      existing.push(book);
    } else {
      groups.set(key, [book]);
    }
  }

  const result: EditionGroup[] = [];
  for (const [key, editions] of groups) {
    editions.sort((a, b) => editionScore(b) - editionScore(a));
    result.push({ key, best: editions[0], editions });
  }

  // Sort groups so author-match results come first (helps when searching by author name)
  if (query) {
    const q = query.toLowerCase().trim();
    result.sort((a, b) => {
      const aMatch = a.best.authors?.some(
        (auth) =>
          auth.toLowerCase().includes(q) || q.includes(auth.toLowerCase()),
      )
        ? 1
        : 0;
      const bMatch = b.best.authors?.some(
        (auth) =>
          auth.toLowerCase().includes(q) || q.includes(auth.toLowerCase()),
      )
        ? 1
        : 0;
      return bMatch - aMatch;
    });
  }

  return result;
}

// --- Book type detection ---

const POETRY_SUBJECT_RE = /\bpoetry\b|\bpoems\b|\bverse\b/i;
const FICTION_SUBJECT_RE =
  /\bfiction\b|\bnovel\b|\bthriller\b|\bmystery\b|\bromance\b|\bfantasy\b|\bsci-fi\b|\bscience fiction\b|\bhorror\b|\bsuspense\b|\bdetective\b/i;

export function detectBookType(
  subjects?: string[],
): "fiction" | "nonfiction" | "poetry" {
  if (!subjects || subjects.length === 0) return "fiction";
  if (subjects.some((s) => POETRY_SUBJECT_RE.test(s))) return "poetry";
  if (subjects.some((s) => FICTION_SUBJECT_RE.test(s))) return "fiction";
  return "nonfiction";
}

// --- Mapping ---

export function mapToBookInsert(book: ISBNdbBook, status: string): BookInsert {
  const isbn = book.isbn13 || book.isbn || null;
  const author = book.authors?.join(", ") ?? "Unknown";

  let summary: string | null = null;
  const synopsis = book.synopsis ? stripHtml(book.synopsis) : "";
  const overview = book.overview ? stripHtml(book.overview) : "";
  const text = synopsis || overview;
  if (text) summary = text;

  let publicationYear: number | null = null;
  if (book.date_published) {
    publicationYear = parseYear(book.date_published);
  }

  let pageCount: number | null = null;
  if (book.pages && book.pages > 0) {
    pageCount = book.pages;
  }

  const publisher = book.publisher?.trim() || null;
  const format = book.binding?.trim() || null;

  return {
    title: book.title,
    author,
    isbn,
    book_type: detectBookType(book.subjects),
    cover_image_url: book.image || null,
    publisher,
    publication_year: publicationYear,
    page_count: pageCount,
    format,
    summary,
    status,
    isbndb_enriched_at: new Date().toISOString(),
    is_favorite: false,
    is_up_next: false,
  };
}
