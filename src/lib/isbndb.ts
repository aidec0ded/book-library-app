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
): Promise<{ total: number; books: ISBNdbBook[] }> {
  const encoded = encodeURIComponent(query);
  const data = await apiFetch<SearchResponse>(
    `/books/${encoded}?page=${page}&pageSize=${pageSize}`,
  );
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
