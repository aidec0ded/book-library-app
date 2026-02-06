import { supabase } from "@/lib/supabase";
import { fetchCanonicalVibesWithCounts } from "@/lib/vibes";
import type { Book } from "@/lib/types";

export type HomeBook = Pick<
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
