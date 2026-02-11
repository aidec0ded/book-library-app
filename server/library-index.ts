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

function formatTagsForType(
  tags: { vibe: string; tag_category: string }[],
  bookType: string,
): string {
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

interface CacheEntry {
  data: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function buildLibraryIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const entry = cache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  // Fetch all books in 1000-row pages
  const PAGE_SIZE = 1000;
  const books: {
    id: string;
    title: string;
    author: string;
    book_type: string | null;
    status: string | null;
    rating: number | null;
    genre: string | null;
  }[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, book_type, status, rating, genre")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    books.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Fetch all canonical tags with category in pages
  const tagRows: { book_id: string; vibe: string; tag_category: string }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("book_vibes")
      .select("book_id, vibe, tag_category")
      .eq("is_canonical", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    tagRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build tag lookup grouped by category
  const tagMap = new Map<string, { vibe: string; tag_category: string }[]>();
  for (const row of tagRows) {
    const existing = tagMap.get(row.book_id);
    if (existing) {
      existing.push(row);
    } else {
      tagMap.set(row.book_id, [row]);
    }
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

  // Build index lines
  const legend =
    "[Format: title / author; [nf|p] status [★rating]; genre; tags. Status: r=read u=unread rg=reading uf=unfinished w=wishlist. Type omitted=fiction, nf=nonfiction, p=poetry]";

  const lines = books.map((book) => {
    const bookType = book.book_type ?? "fiction";
    const parts = [`${book.title} / ${book.author}`];

    // Type (omit fiction as default) + status + rating
    const meta: string[] = [];
    const typeCode = TYPE_ABBR[bookType];
    if (typeCode) meta.push(typeCode);
    if (book.status) meta.push(STATUS_ABBR[book.status] ?? book.status);
    if (book.rating != null) meta.push(`★${book.rating}`);
    if (meta.length > 0) parts.push(meta.join(" "));

    if (book.genre) parts.push(book.genre);
    const tags = tagMap.get(book.id);
    if (tags) {
      const formatted = formatTagsForType(tags, bookType);
      if (formatted) parts.push(formatted);
    }
    return parts.join("; ");
  });

  const index = `${legend}\n${lines.join("\n")}`;
  cache.set(userId, { data: index, cachedAt: Date.now() });
  return index;
}
