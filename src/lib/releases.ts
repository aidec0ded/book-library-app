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
  // Paginate to avoid Supabase's default 1000-row limit
  const PAGE = 1000;
  const allRows: { pub_year: number; pub_month: number }[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("new_releases")
      .select("pub_year, pub_month")
      .not("pub_year", "is", null)
      .not("pub_month", "is", null)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...(data as { pub_year: number; pub_month: number }[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const counts = new Map<string, { year: number; month: number; count: number }>();

  for (const row of allRows) {
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

export async function addReleaseToWishlist(release: NewRelease): Promise<string> {
  // Check for existing book by ISBN
  const { data: existing } = await supabase
    .from("books")
    .select("id")
    .eq("isbn", release.isbn13)
    .maybeSingle();

  if (existing) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("books")
    .insert({
      isbn: release.isbn13,
      title: release.title,
      author: release.authors.join(", ") || "Unknown",
      cover_image_url: release.cover_image_url,
      publisher: release.publisher,
      publication_year: release.pub_year,
      page_count: release.page_count,
      format: release.binding,
      summary: release.synopsis,
      status: "wishlist",
      is_favorite: false,
      is_up_next: false,
      isbndb_enriched_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
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
