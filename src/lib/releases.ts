import { supabase } from "@/lib/supabase";
import type { NewRelease } from "@/lib/types";
import { NOTABLE_MIN_GENERAL } from "@/lib/release-scoring";

const PAGE_SIZE = 24;
/** A personal score this high puts a release on the reader's Recommended list. */
const RECOMMENDED_MIN_PERSONAL = 7;

/**
 * Recommended: the reader's personal picks, once they've asked for curation.
 * Notable: the month's releases with a general score of NOTABLE_MIN_GENERAL or more.
 */
export type ReleaseView = "recommended" | "notable";
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
  view: ReleaseView = "notable",
  showDismissed: boolean = false,
  category: ReleaseCategory = "all",
): Promise<{ releases: NewRelease[]; total: number }> {
  if (view === "recommended") {
    return fetchRecommended(year, month, page, showDismissed, category);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("new_releases")
    .select("*, user_release_scores(*)", { count: "exact" })
    .eq("pub_year", year)
    .eq("pub_month", month)
    // Hide what triage dropped: other formats, reprints, activity and academic books
    .is("skip_reason", null)
    .gte("general_signal_score", NOTABLE_MIN_GENERAL);

  if (category === "fiction") {
    query = query.eq("is_fiction", true);
  } else if (category === "nonfiction") {
    query = query.eq("is_fiction", false);
  }

  query = query
    .order("general_signal_score", { ascending: false })
    .order("title");

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

/** The reader's personal picks for a month, best match first. */
async function fetchRecommended(
  year: number,
  month: number,
  page: number,
  showDismissed: boolean,
  category: ReleaseCategory,
): Promise<{ releases: NewRelease[]; total: number }> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // From the reader's scores (RLS keeps them to their own), each with its release
  let query = supabase
    .from("user_release_scores")
    .select("personal_score, ai_score, ai_rationale, scored_at, dismissed, new_releases!inner(*)", {
      count: "exact",
    })
    .gte("personal_score", RECOMMENDED_MIN_PERSONAL)
    .eq("new_releases.pub_year", year)
    .eq("new_releases.pub_month", month)
    .is("new_releases.skip_reason", null);

  if (!showDismissed) query = query.eq("dismissed", false);
  if (category === "fiction") {
    query = query.eq("new_releases.is_fiction", true);
  } else if (category === "nonfiction") {
    query = query.eq("new_releases.is_fiction", false);
  }

  const { data, count, error } = await query
    .order("ai_score", { ascending: false })
    .order("release_id")
    .range(from, to);
  if (error) throw error;

  type ScoreRow = ReleaseRow["user_release_scores"][number] & {
    new_releases: Omit<ReleaseRow, "user_release_scores">;
  };
  const rows = (data ?? []) as unknown as ScoreRow[];
  return {
    releases: rows.map(({ new_releases, ...score }) => mapRow({ ...new_releases, user_release_scores: [score] })),
    total: count ?? 0,
  };
}

export interface ReleaseCuration {
  requested_at: string;
  last_visited_at: string;
}

/** Whether the reader has asked for their releases to be curated, and when. */
export async function fetchCuration(): Promise<ReleaseCuration | null> {
  const { data, error } = await supabase
    .from("release_curation")
    .select("requested_at, last_visited_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Record a visit to Releases. Curation continues while the reader keeps visiting,
 * so this keeps it going; at most once a day, to save writes.
 */
export async function recordReleasesVisit(curation: ReleaseCuration): Promise<void> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(curation.last_visited_at).getTime() < DAY_MS) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("release_curation")
    .update({ last_visited_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) throw error;
}

/**
 * Ask for curation. Returns "no_profile" when the reader has no profile yet to
 * score against.
 */
export async function requestCuration(): Promise<{ requested_at: string } | "no_profile"> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const response = await fetch("/api/releases/curate", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.status === 409) return "no_profile";
  if (!response.ok) throw new Error("Failed to request curation");
  return (await response.json()) as { requested_at: string };
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

/** Months with releases, oldest first, each with how many notable releases it has. */
export async function fetchAvailableMonths(): Promise<
  { year: number; month: number; count: number }[]
> {
  // Counted in the database (migration 030), not by downloading every release
  const { data, error } = await supabase.rpc("release_month_counts", {
    min_general: NOTABLE_MIN_GENERAL,
  });
  if (error) throw error;

  return ((data ?? []) as { pub_year: number; pub_month: number; notable: number }[]).map((row) => ({
    year: row.pub_year,
    month: row.pub_month,
    count: Number(row.notable),
  }));
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
      added_via: "release",
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
