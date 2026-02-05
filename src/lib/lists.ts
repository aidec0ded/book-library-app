import { supabase } from "@/lib/supabase";
import type { Book, List, ListItem, ListWithCount } from "@/lib/types";

export async function fetchLists(): Promise<ListWithCount[]> {
  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (listsError) throw listsError;

  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("list_id, book_id, position")
    .order("position");

  if (itemsError) throw itemsError;

  // Group items by list for counts and first-position book IDs
  const listItemsMap = new Map<string, { book_id: string; position: number }[]>();
  for (const item of items) {
    const group = listItemsMap.get(item.list_id) ?? [];
    group.push({ book_id: item.book_id, position: item.position });
    listItemsMap.set(item.list_id, group);
  }

  // Collect first-position book IDs for cover books
  const coverBookIds = new Set<string>();
  for (const [, listItems] of listItemsMap) {
    if (listItems.length > 0) {
      const sorted = listItems.sort((a, b) => a.position - b.position);
      coverBookIds.add(sorted[0].book_id);
    }
  }

  // Fetch cover books in one query
  const coverBooksMap = new Map<string, { title: string; author: string; cover_image_url: string | null }>();
  if (coverBookIds.size > 0) {
    const { data: coverBooks, error: coverError } = await supabase
      .from("books")
      .select("id, title, author, cover_image_url")
      .in("id", [...coverBookIds]);

    if (coverError) throw coverError;
    for (const book of coverBooks ?? []) {
      coverBooksMap.set(book.id, book);
    }
  }

  return (lists ?? []).map((list) => {
    const listItems = listItemsMap.get(list.id) ?? [];
    const firstItem = listItems.sort((a, b) => a.position - b.position)[0];
    const coverBook = firstItem ? coverBooksMap.get(firstItem.book_id) ?? null : null;
    return {
      ...list,
      book_count: listItems.length,
      cover_book: coverBook,
    };
  });
}

export async function fetchList(id: string): Promise<List | null> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchListItems(
  listId: string,
): Promise<(ListItem & { book: Book })[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select("*, book:books(*)")
    .eq("list_id", listId)
    .order("position");

  if (error) throw error;
  return data ?? [];
}

export async function createList(
  name: string,
  description: string | null,
): Promise<List> {
  const { data, error } = await supabase
    .from("lists")
    .insert({ name, description })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateList(
  id: string,
  fields: Partial<Pick<List, "name" | "description">>,
): Promise<void> {
  const { error } = await supabase.from("lists").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from("lists").delete().eq("id", id);
  if (error) throw error;
}

export async function addListItem(
  listId: string,
  bookId: string,
): Promise<ListItem | null> {
  // Get max position
  const { data: existing, error: fetchError } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);

  if (fetchError) throw fetchError;

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("list_items")
    .insert({ list_id: listId, book_id: bookId, position: nextPosition })
    .select()
    .single();

  if (error) {
    // unique_violation — book already in this list
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

export async function removeListItem(
  listId: string,
  bookId: string,
): Promise<void> {
  // Get the position of the item being removed
  const { data: removed, error: fetchError } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .eq("book_id", bookId)
    .single();

  if (fetchError) throw fetchError;

  const { error: deleteError } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("book_id", bookId);

  if (deleteError) throw deleteError;

  // Decrement positions of items after the removed one
  const { data: after, error: afterError } = await supabase
    .from("list_items")
    .select("id, position")
    .eq("list_id", listId)
    .gt("position", removed.position);

  if (afterError) throw afterError;

  await Promise.all(
    (after ?? []).map((item) =>
      supabase
        .from("list_items")
        .update({ position: item.position - 1 })
        .eq("id", item.id),
    ),
  );
}

export async function reorderListItem(
  listId: string,
  bookId: string,
  newPosition: number,
): Promise<void> {
  const { data: items, error } = await supabase
    .from("list_items")
    .select("id, book_id, position")
    .eq("list_id", listId)
    .order("position");

  if (error) throw error;
  if (!items || items.length === 0) return;

  // Remove target from array and insert at new index
  const targetIdx = items.findIndex((item) => item.book_id === bookId);
  if (targetIdx === -1) return;

  const [target] = items.splice(targetIdx, 1);
  const insertIdx = Math.max(0, Math.min(newPosition - 1, items.length));
  items.splice(insertIdx, 0, target);

  // Assign dense positions 1, 2, 3, ... and update changed rows
  const updates = items
    .map((item, i) => ({ id: item.id, oldPosition: item.position, newPosition: i + 1 }))
    .filter((u) => u.oldPosition !== u.newPosition);

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("list_items")
        .update({ position: u.newPosition })
        .eq("id", u.id),
    ),
  );
}
