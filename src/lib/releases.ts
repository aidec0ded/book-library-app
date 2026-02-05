import { supabase } from "@/lib/supabase";
import type { NewRelease } from "@/lib/types";

const PAGE_SIZE = 24;

export type ReleaseSort = "score" | "title";

export async function fetchReleasesByMonth(
  year: number,
  month: number,
  page: number,
  sort: ReleaseSort = "score",
  showDismissed: boolean = false,
): Promise<{ releases: NewRelease[]; total: number }> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("new_releases")
    .select("*", { count: "exact" })
    .eq("pub_year", year)
    .eq("pub_month", month);

  if (!showDismissed) {
    query = query.eq("dismissed", false);
  }

  if (sort === "score") {
    query = query
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("title");
  } else {
    query = query.order("title");
  }

  const { data, count, error } = await query.range(from, to);

  if (error) throw error;

  return {
    releases: (data ?? []) as NewRelease[],
    total: count ?? 0,
  };
}

export async function dismissRelease(isbn13: string): Promise<void> {
  const { error } = await supabase
    .from("new_releases")
    .update({ dismissed: true })
    .eq("isbn13", isbn13);

  if (error) throw error;
}

export async function undismissRelease(isbn13: string): Promise<void> {
  const { error } = await supabase
    .from("new_releases")
    .update({ dismissed: false })
    .eq("isbn13", isbn13);

  if (error) throw error;
}

export async function fetchAvailableMonths(): Promise<
  { year: number; month: number; count: number }[]
> {
  const { data, error } = await supabase
    .from("new_releases")
    .select("pub_year, pub_month");

  if (error) throw error;

  const counts = new Map<string, { year: number; month: number; count: number }>();

  for (const row of data ?? []) {
    if (row.pub_year == null || row.pub_month == null) continue;
    const key = `${row.pub_year}-${row.pub_month}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { year: row.pub_year, month: row.pub_month, count: 1 });
    }
  }

  return Array.from(counts.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
}

export async function fetchLibraryIsbns(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("books")
    .select("isbn")
    .not("isbn", "is", null);

  if (error) throw error;

  const isbns = new Set<string>();
  for (const row of data ?? []) {
    if (row.isbn) isbns.add(row.isbn);
  }
  return isbns;
}
