import { supabase } from "@/lib/supabase";
import type { BookVibe, BookSummary } from "@/lib/types";

export async function fetchVibesForBook(bookId: string): Promise<BookVibe[]> {
  const { data, error } = await supabase
    .from("book_vibes")
    .select("*")
    .eq("book_id", bookId)
    .order("vibe");

  if (error) throw error;
  return data;
}

export async function fetchAllVibes(): Promise<string[]> {
  const { data, error } = await supabase
    .from("book_vibes")
    .select("vibe");

  if (error) throw error;

  const unique = [...new Set(data.map((row) => row.vibe))];
  unique.sort();
  return unique;
}

export async function addVibe(
  bookId: string,
  vibe: string,
  isCanonical = false,
): Promise<BookVibe | null> {
  const normalized = vibe.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("book_vibes")
    .insert({
      book_id: bookId,
      vibe: normalized,
      ai_assigned: false,
      user_confirmed: true,
      is_canonical: isCanonical,
    })
    .select()
    .single();

  if (error) {
    // unique_violation — vibe already exists on this book
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

export async function confirmVibe(vibeId: string): Promise<void> {
  const { error } = await supabase
    .from("book_vibes")
    .update({ user_confirmed: true })
    .eq("id", vibeId);
  if (error) throw error;
}

export async function removeVibe(vibeId: string): Promise<void> {
  const { error } = await supabase
    .from("book_vibes")
    .delete()
    .eq("id", vibeId);

  if (error) throw error;
}

export async function fetchCanonicalVibesWithCounts(): Promise<
  { vibe: string; count: number }[]
> {
  // Supabase defaults to 1000 rows — paginate to get all canonical vibe rows
  const PAGE_SIZE = 1000;
  let allRows: { vibe: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("vibe")
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const counts = new Map<string, number>();
  for (const row of allRows) {
    counts.set(row.vibe, (counts.get(row.vibe) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([vibe, count]) => ({ vibe, count }))
    .sort((a, b) => b.count - a.count);
}

export async function fetchBookIdsByCanonicalVibes(
  vibes: string[],
): Promise<string[]> {
  if (vibes.length === 0) return [];

  const { data, error } = await supabase
    .from("book_vibes")
    .select("book_id")
    .in("vibe", vibes)
    .eq("is_canonical", true);

  if (error) throw error;
  return [...new Set(data.map((r) => r.book_id))];
}

export async function fetchCanonicalVibesForBooks(
  bookIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (bookIds.length === 0) return result;

  const { data, error } = await supabase
    .from("book_vibes")
    .select("book_id, vibe")
    .in("book_id", bookIds)
    .eq("is_canonical", true);

  if (error) throw error;

  for (const row of data) {
    const existing = result.get(row.book_id);
    if (existing) {
      existing.push(row.vibe);
    } else {
      result.set(row.book_id, [row.vibe]);
    }
  }
  return result;
}

export async function fetchBooksByCanonicalVibe(
  vibe: string,
  page: number,
  pageSize: number,
): Promise<{ books: BookSummary[]; count: number }> {
  // Get all book IDs with this canonical vibe
  const { data: vibeRows, error: vibeError } = await supabase
    .from("book_vibes")
    .select("book_id")
    .eq("vibe", vibe)
    .eq("is_canonical", true);

  if (vibeError) throw vibeError;

  const bookIds = vibeRows.map((r) => r.book_id);
  if (bookIds.length === 0) return { books: [], count: 0 };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("books")
    .select("id, title, author, status, rating, timing_raw", { count: "exact" })
    .in("id", bookIds)
    .order("title")
    .range(from, to);

  if (error) throw error;
  return { books: data ?? [], count: count ?? 0 };
}
