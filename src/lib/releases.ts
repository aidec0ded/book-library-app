import { supabase } from "@/lib/supabase";
import type { NewRelease } from "@/lib/types";

const PAGE_SIZE = 24;

export type ReleaseSort = "score" | "title";
export type ReleaseCategory = "all" | "fiction" | "nonfiction";

// Shape returned by the join query
interface ReleaseRow {
  id: string;
  isbn13: string;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  date_published: string | null;
  pub_year: number | null;
  pub_month: number | null;
  cover_image_url: string | null;
  synopsis: string | null;
  subjects: string[];
  binding: string | null;
  page_count: number | null;
  language: string | null;
  edition: string | null;
  source: string;
  ingested_at: string;
  updated_at: string;
  general_signal_score: number | null;
  is_fiction: boolean | null;
  user_release_scores: {
    personal_score: number | null;
    ai_score: number | null;
    ai_rationale: string | null;
    scored_at: string | null;
    dismissed: boolean;
  }[];
}

function mapRow(row: ReleaseRow): NewRelease {
  const userScore = row.user_release_scores?.[0];
  return {
    id: row.id,
    isbn13: row.isbn13,
    isbn10: row.isbn10,
    title: row.title,
    authors: row.authors,
    publisher: row.publisher,
    date_published: row.date_published,
    pub_year: row.pub_year,
    pub_month: row.pub_month,
    cover_image_url: row.cover_image_url,
    synopsis: row.synopsis,
    subjects: row.subjects,
    binding: row.binding,
    page_count: row.page_count,
    language: row.language,
    edition: row.edition,
    source: row.source,
    ingested_at: row.ingested_at,
    updated_at: row.updated_at,
    general_signal_score: row.general_signal_score,
    is_fiction: row.is_fiction,
    personal_score: userScore?.personal_score ?? null,
    ai_score: userScore?.ai_score ?? null,
    ai_rationale: userScore?.ai_rationale ?? null,
    scored_at: userScore?.scored_at ?? null,
    dismissed: userScore?.dismissed ?? false,
  };
}

export async function fetchReleasesByMonth(
  year: number,
  month: number,
  page: number,
  sort: ReleaseSort = "score",
  showDismissed: boolean = false,
  category: ReleaseCategory = "all",
): Promise<{ releases: NewRelease[]; total: number }> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("new_releases")
    .select("*, user_release_scores(*)", { count: "exact" })
    .eq("pub_year", year)
    .eq("pub_month", month);

  if (category === "fiction") {
    query = query.eq("is_fiction", true);
  } else if (category === "nonfiction") {
    query = query.eq("is_fiction", false);
  }

  if (sort === "score") {
    query = query
      .gte("general_signal_score", 7)
      .order("general_signal_score", { ascending: false, nullsFirst: false })
      .order("title");
  } else {
    query = query.order("title");
  }

  const { data, count, error } = await query.range(from, to);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ReleaseRow[];
  let releases = rows.map(mapRow);

  // Client-side dismissed filtering (since dismissed is now per-user via join)
  if (!showDismissed) {
    releases = releases.filter((r) => !r.dismissed);
  }

  return {
    releases,
    total: count ?? 0,
  };
}

export async function dismissRelease(releaseId: string): Promise<void> {
  const { error } = await supabase
    .from("user_release_scores")
    .upsert(
      { release_id: releaseId, dismissed: true },
      { onConflict: "user_id,release_id" },
    );

  if (error) throw error;
}

export async function undismissRelease(releaseId: string): Promise<void> {
  const { error } = await supabase
    .from("user_release_scores")
    .upsert(
      { release_id: releaseId, dismissed: false },
      { onConflict: "user_id,release_id" },
    );

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
