import { supabase } from "@/lib/supabase";
import type { NewRelease } from "@/lib/types";

const PAGE_SIZE = 24;

export async function fetchReleasesByMonth(
  year: number,
  month: number,
  page: number
): Promise<{ releases: NewRelease[]; total: number }> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await supabase
    .from("new_releases")
    .select("*", { count: "exact" })
    .eq("pub_year", year)
    .eq("pub_month", month)
    .order("title")
    .range(from, to);

  if (error) throw error;

  return {
    releases: (data ?? []) as NewRelease[],
    total: count ?? 0,
  };
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
