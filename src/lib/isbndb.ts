import { supabase } from "@/lib/supabase";
import type { ISBNdbBook } from "@/lib/editions";

export * from "@/lib/editions";

const BASE_URL = "/api/isbndb";

// --- Types ---

interface SearchResponse {
  total: number;
  books: ISBNdbBook[];
}

interface BookResponse {
  book: ISBNdbBook;
}

// --- Helpers ---

async function apiFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(session?.access_token && {
        Authorization: `Bearer ${session.access_token}`,
      }),
    },
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
