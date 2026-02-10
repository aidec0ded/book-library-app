import type { SupabaseClient } from "@supabase/supabase-js";

interface CacheEntry {
  data: string | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function buildSyllabusIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const entry = cache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("id, name, description")
    .order("created_at", { ascending: false });

  if (listsError) throw listsError;

  if (!lists || lists.length === 0) {
    cache.set(userId, { data: null, cachedAt: Date.now() });
    return null;
  }

  // Fetch all list items with joined book data
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("list_id, position, rationale, book_id, external_title, external_author, book:books(title, author)")
    .order("position");

  if (itemsError) throw itemsError;

  // Group items by list
  const itemsByList = new Map<
    string,
    { position: number; title: string; author: string; rationale: string | null; isExternal: boolean }[]
  >();
  for (const item of items ?? []) {
    let title: string;
    let author: string;
    let isExternal = false;

    if (item.book_id) {
      const book = item.book as unknown as { title: string; author: string };
      if (!book) continue;
      title = book.title;
      author = book.author;
    } else {
      title = (item.external_title as string) ?? "Untitled";
      author = (item.external_author as string) ?? "Unknown";
      isExternal = true;
    }

    const list = itemsByList.get(item.list_id) ?? [];
    list.push({
      position: item.position as number,
      title,
      author,
      rationale: item.rationale as string | null,
      isExternal,
    });
    itemsByList.set(item.list_id, list);
  }

  // Format output
  const sections: string[] = ["### Your Syllabi"];

  for (const list of lists) {
    const listItems = itemsByList.get(list.id as string) ?? [];
    let header = `\n${list.name} (${listItems.length} item${listItems.length === 1 ? "" : "s"})`;
    if (list.description) header += `: ${list.description}`;
    sections.push(header);

    for (const item of listItems) {
      let line = `  ${item.position}. ${item.title} by ${item.author}`;
      if (item.isExternal) line += " [not in library]";
      if (item.rationale) line += ` — ${item.rationale}`;
      sections.push(line);
    }
  }

  const index = sections.join("\n");
  cache.set(userId, { data: index, cachedAt: Date.now() });
  return index;
}
