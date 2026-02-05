import { supabase } from "@/lib/supabase";
import { fetchCanonicalVibesWithCounts } from "@/lib/vibes";
import type { Book } from "@/lib/types";

type HomeBook = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "cover_image_url"
  | "status"
  | "predicted_rating"
  | "created_at"
>;

export async function fetchCurrentlyReading(): Promise<HomeBook[]> {
  const { data, error } = await supabase
    .from("books")
    .select(
      "id, title, author, cover_image_url, status, predicted_rating, created_at",
    )
    .eq("status", "reading")
    .order("date_started", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchAiSuggestions(month: number): Promise<HomeBook[]> {
  const TARGET = 5;
  const seen = new Set<string>();
  const results: HomeBook[] = [];

  function addBooks(books: HomeBook[]) {
    for (const book of books) {
      if (results.length >= TARGET) break;
      if (seen.has(book.id)) continue;
      seen.add(book.id);
      results.push(book);
    }
  }

  // Tier 1: seasonal + high predicted rating
  const { data: tier1 } = await supabase
    .from("books")
    .select(
      "id, title, author, cover_image_url, status, predicted_rating, created_at",
    )
    .eq("status", "unread")
    .eq("timing_month", month)
    .gte("predicted_rating", 3.5)
    .order("predicted_rating", { ascending: false })
    .limit(TARGET);

  if (tier1) addBooks(tier1);

  // Tier 2: seasonal, any rating
  if (results.length < TARGET) {
    const { data: tier2 } = await supabase
      .from("books")
      .select(
        "id, title, author, cover_image_url, status, predicted_rating, created_at",
      )
      .eq("status", "unread")
      .eq("timing_month", month)
      .order("predicted_rating", { ascending: false, nullsFirst: false })
      .limit(TARGET);

    if (tier2) addBooks(tier2);
  }

  // Tier 3: highest predicted rating regardless of timing
  if (results.length < TARGET) {
    const { data: tier3 } = await supabase
      .from("books")
      .select(
        "id, title, author, cover_image_url, status, predicted_rating, created_at",
      )
      .eq("status", "unread")
      .not("predicted_rating", "is", null)
      .order("predicted_rating", { ascending: false })
      .limit(TARGET);

    if (tier3) addBooks(tier3);
  }

  return results;
}

export async function fetchRecentAdditions(): Promise<HomeBook[]> {
  const { data, error } = await supabase
    .from("books")
    .select(
      "id, title, author, cover_image_url, status, predicted_rating, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return data;
}

export interface LibraryStats {
  totalBooks: number;
  readBooks: number;
  readPercent: number;
  topAuthor: { name: string; count: number } | null;
  topVibe: { name: string; count: number } | null;
}

export async function fetchLibraryStats(): Promise<LibraryStats> {
  // Fetch all books (status + author only)
  const PAGE_SIZE = 1000;
  const allBooks: { status: string | null; author: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("status, author")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    allBooks.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const totalBooks = allBooks.length;
  const readBooks = allBooks.filter((b) => b.status === "read").length;
  const readPercent = totalBooks > 0 ? (readBooks / totalBooks) * 100 : 0;

  // Top author
  const authorCounts = new Map<string, number>();
  for (const book of allBooks) {
    if (book.author) {
      authorCounts.set(book.author, (authorCounts.get(book.author) ?? 0) + 1);
    }
  }
  let topAuthor: { name: string; count: number } | null = null;
  for (const [name, count] of authorCounts) {
    if (!topAuthor || count > topAuthor.count) {
      topAuthor = { name, count };
    }
  }

  // Top vibe from canonical vibes
  let topVibe: { name: string; count: number } | null = null;
  try {
    const vibes = await fetchCanonicalVibesWithCounts();
    const firstVibe = vibes[0];
    if (firstVibe) {
      topVibe = { name: firstVibe.vibe, count: firstVibe.count };
    }
  } catch {
    // Non-critical
  }

  return { totalBooks, readBooks, readPercent, topAuthor, topVibe };
}

export async function fetchGreeting(): Promise<string> {
  try {
    const res = await fetch("/api/greeting");
    if (!res.ok) return "";
    const data = await res.json();
    return data.greeting ?? "";
  } catch {
    return "";
  }
}
