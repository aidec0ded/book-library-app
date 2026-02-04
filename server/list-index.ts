import type { SupabaseClient } from "@supabase/supabase-js";

let cachedIndex: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function buildListIndex(
  supabase: SupabaseClient,
): Promise<string | null> {
  if (cachedIndex !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("id, name, description")
    .order("created_at", { ascending: false });

  if (listsError) throw listsError;

  if (!lists || lists.length === 0) {
    cachedIndex = null;
    cachedAt = Date.now();
    return null;
  }

  // Fetch all list items with joined book data
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("list_id, position, book:books(title, author)")
    .order("position");

  if (itemsError) throw itemsError;

  // Group items by list
  const itemsByList = new Map<
    string,
    { position: number; title: string; author: string }[]
  >();
  for (const item of items ?? []) {
    const book = item.book as unknown as { title: string; author: string };
    if (!book) continue;

    const list = itemsByList.get(item.list_id) ?? [];
    list.push({
      position: item.position as number,
      title: book.title,
      author: book.author,
    });
    itemsByList.set(item.list_id, list);
  }

  // Format output
  const sections: string[] = ["### Your Lists"];

  for (const list of lists) {
    const listItems = itemsByList.get(list.id as string) ?? [];
    let header = `\n${list.name} (${listItems.length} book${listItems.length === 1 ? "" : "s"})`;
    if (list.description) header += `: ${list.description}`;
    sections.push(header);

    for (const item of listItems) {
      sections.push(`  ${item.position}. ${item.title} by ${item.author}`);
    }
  }

  cachedIndex = sections.join("\n");
  cachedAt = Date.now();
  return cachedIndex;
}
