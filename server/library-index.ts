import type { SupabaseClient } from "@supabase/supabase-js";

const TAG_LABELS: Record<string, string> = {
  vibe: "vibes",
  topic: "topics",
  form: "form",
  depth: "depth",
  movement: "movement",
  formal_feel: "feel",
  accessibility: "accessibility",
};

export interface BookTag {
  vibe: string;
  tag_category: string;
}

function formatTagsForType(tags: BookTag[], bookType: string): string {
  // Group tags by category
  const grouped = new Map<string, string[]>();
  for (const t of tags) {
    const existing = grouped.get(t.tag_category);
    if (existing) existing.push(t.vibe);
    else grouped.set(t.tag_category, [t.vibe]);
  }

  // For fiction, just list vibes
  if (bookType === "fiction") {
    const vibes = grouped.get("vibe");
    return vibes ? vibes.join(", ") : "";
  }

  // For nonfiction/poetry, label each category
  const parts: string[] = [];
  for (const [category, values] of grouped) {
    const label = TAG_LABELS[category] ?? category;
    parts.push(`${label}: ${values.join(", ")}`);
  }
  return parts.join("; ");
}

export interface IndexBook {
  id: string;
  title: string;
  author: string;
  book_type: string | null;
  status: string | null;
  rating: number | null;
  genre: string | null;
  is_favorite: boolean | null;
  predicted_rating?: number | null;
  date_finished?: string | null;
  page_count?: number | null;
}

const STATUS_ABBR: Record<string, string> = {
  read: "r",
  unread: "u",
  reading: "rg",
  unfinished: "uf",
  wishlist: "w",
};

const TYPE_ABBR: Record<string, string> = {
  nonfiction: "nf",
  poetry: "p",
};

export const INDEX_LEGEND =
  "[Format: title / author; [nf|p] status [★rating] [♥ favorite] [~predicted rating] [pages]; genre; tags. Status: r=read u=unread rg=reading uf=unfinished w=wishlist. Type omitted=fiction, nf=nonfiction, p=poetry]";

/** One book as a compact index line, shared by the index and search_library. */
export function formatBookLine(book: IndexBook, tags: BookTag[] | undefined): string {
  const bookType = book.book_type ?? "fiction";
  const parts = [`${book.title} / ${book.author}`];

  // Type (omit fiction as default) + status + rating
  const meta: string[] = [];
  const typeCode = TYPE_ABBR[bookType];
  if (typeCode) meta.push(typeCode);
  if (book.status) meta.push(STATUS_ABBR[book.status] ?? book.status);
  if (book.rating != null) meta.push(`★${book.rating}`);
  if (book.is_favorite) meta.push("♥");
  if (book.predicted_rating != null && book.rating == null) meta.push(`~${book.predicted_rating}`);
  if (book.date_finished) meta.push(`finished ${book.date_finished}`);
  if (book.page_count) meta.push(`${book.page_count}p`);
  if (meta.length > 0) parts.push(meta.join(" "));

  if (book.genre) parts.push(book.genre);
  if (tags) {
    const formatted = formatTagsForType(tags, bookType);
    if (formatted) parts.push(formatted);
  }
  return parts.join("; ");
}

/**
 * The books always in the prompt: the reader's reading life so far. Everything they
 * have read, are reading, gave up on, rated, or marked a favorite. Unread books and
 * the wishlist (most of a large library) are found with search_library instead.
 */
function isCoreBook(book: IndexBook): boolean {
  return (
    book.status === "read" ||
    book.status === "reading" ||
    book.status === "unfinished" ||
    book.rating != null ||
    book.is_favorite === true
  );
}

interface CacheEntry {
  data: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TAG_SUMMARY_COUNT = 12;

/** Drop the cached index after the companion changes a book, so its next message sees the change. */
export function invalidateLibraryIndex(userId: string): void {
  cache.delete(`${userId}:core`);
  cache.delete(`${userId}:full`);
}

/**
 * The library as it goes into the chat prompt.
 *
 * By default only the reader's reading life is listed in full (see isCoreBook), with
 * a summary of the unread books and wishlist that search_library can find. Listing
 * every unread book cost about 33,000 tokens on every call for a 900-book library.
 * `full` lists every book, for onboarding, where the AI is getting to know an
 * imported library.
 *
 * Books are ordered by status, then title, so the text only changes when the
 * library does, and the prompt cache holds between calls.
 */
export async function buildLibraryIndex(
  supabase: SupabaseClient,
  userId: string,
  options: { full?: boolean } = {},
): Promise<string> {
  const cacheKey = `${userId}:${options.full ? "full" : "core"}`;
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  // Fetch all books in 1000-row pages, in a stable order
  const PAGE_SIZE = 1000;
  const books: IndexBook[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, book_type, status, rating, genre, is_favorite")
      .order("title")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    books.push(...(data as IndexBook[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Fetch all canonical tags with category in pages
  const tagRows: (BookTag & { book_id: string })[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe, tag_category")
      .eq("is_canonical", true)
      .order("book_id")
      .order("tag_category")
      .order("vibe")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    tagRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build tag lookup grouped by category
  const tagMap = new Map<string, BookTag[]>();
  for (const row of tagRows) {
    const existing = tagMap.get(row.book_id);
    if (existing) {
      existing.push(row);
    } else {
      tagMap.set(row.book_id, [row]);
    }
  }

  const line = (book: IndexBook) => formatBookLine(book, tagMap.get(book.id));
  let index: string;

  if (options.full) {
    index = `${INDEX_LEGEND}\n${books.map(line).join("\n")}`;
  } else {
    const reading = books.filter((b) => b.status === "reading");
    const pastReading = books.filter((b) => b.status !== "reading" && isCoreBook(b));
    const elsewhere = books.filter((b) => !isCoreBook(b));
    const unread = elsewhere.filter((b) => b.status !== "wishlist").length;
    const wishlist = elsewhere.length - unread;

    // What the unlisted books are like, so the AI knows what a search could find
    const tagCounts = new Map<string, number>();
    for (const book of elsewhere) {
      for (const t of tagMap.get(book.id) ?? []) tagCounts.set(t.vibe, (tagCounts.get(t.vibe) ?? 0) + 1);
    }
    const commonTags = [...tagCounts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_SUMMARY_COUNT)
      .map(([tag, n]) => `${tag} (${n})`)
      .join(", ");

    const sections = [INDEX_LEGEND];
    if (reading.length > 0) sections.push(`### Reading now\n${reading.map(line).join("\n")}`);
    sections.push(
      `### Read, rated, or favorite\n${pastReading.length > 0 ? pastReading.map(line).join("\n") : "None yet."}`,
    );
    if (elsewhere.length > 0) {
      sections.push(
        `### Not listed: ${unread} unread and ${wishlist} on the wishlist\n` +
          `Find these with search_library: by title or author, by tag or type, or sorted by predicted rating.` +
          (commonTags ? ` Most common tags among them: ${commonTags}.` : ""),
      );
    }
    index = sections.join("\n\n");
  }

  cache.set(cacheKey, { data: index, cachedAt: Date.now() });
  return index;
}
