import type { SupabaseClient } from "@supabase/supabase-js";

let cachedIndex: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function buildLibraryIndex(
  supabase: SupabaseClient,
): Promise<string> {
  if (cachedIndex && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  // Fetch all books in 1000-row pages
  const PAGE_SIZE = 1000;
  const books: {
    id: string;
    title: string;
    author: string;
    status: string | null;
    rating: number | null;
    genre: string | null;
  }[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, status, rating, genre")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    books.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Fetch all canonical vibes in pages
  const vibeRows: { book_id: string; vibe: string }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe")
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    vibeRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build vibe lookup
  const vibeMap = new Map<string, string[]>();
  for (const row of vibeRows) {
    const existing = vibeMap.get(row.book_id);
    if (existing) {
      existing.push(row.vibe);
    } else {
      vibeMap.set(row.book_id, [row.vibe]);
    }
  }

  // Build index lines
  const lines = books.map((book) => {
    const parts = [`${book.title} by ${book.author}`];
    if (book.status) parts.push(book.status);
    if (book.rating != null) parts.push(`★${book.rating}`);
    if (book.genre) parts.push(book.genre);
    const vibes = vibeMap.get(book.id);
    if (vibes) parts.push(vibes.join(", "));
    return parts.join(" | ");
  });

  cachedIndex = lines.join("\n");
  cachedAt = Date.now();
  return cachedIndex;
}
