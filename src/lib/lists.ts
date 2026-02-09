import { supabase } from "@/lib/supabase";
import type { Book, List, ListItem, ListWithCount } from "@/lib/types";

export type SyllabusItemWithBook = ListItem & { book: Book | null };

export async function fetchSyllabi(): Promise<ListWithCount[]> {
  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (listsError) throw listsError;

  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("list_id, book_id, position, external_title, external_author, external_cover_url")
    .order("position");

  if (itemsError) throw itemsError;

  // Group items by list
  const listItemsMap = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const group = listItemsMap.get(item.list_id) ?? [];
    group.push(item);
    listItemsMap.set(item.list_id, group);
  }

  // Collect book IDs for cover lookups (up to 3 per list)
  const allCoverBookIds = new Set<string>();
  for (const [, listItems] of listItemsMap) {
    const sorted = listItems.sort((a, b) => a.position - b.position);
    for (const item of sorted.slice(0, 3)) {
      if (item.book_id) allCoverBookIds.add(item.book_id);
    }
  }

  // Fetch cover books in one query
  const coverBooksMap = new Map<string, { title: string; author: string; cover_image_url: string | null }>();
  if (allCoverBookIds.size > 0) {
    const { data: coverBooks, error: coverError } = await supabase
      .from("books")
      .select("id, title, author, cover_image_url")
      .in("id", [...allCoverBookIds]);

    if (coverError) throw coverError;
    for (const book of coverBooks ?? []) {
      coverBooksMap.set(book.id, book);
    }
  }

  return (lists ?? []).map((list) => {
    const listItems = (listItemsMap.get(list.id) ?? []).sort((a, b) => a.position - b.position);
    const coverBooks: { title: string; author: string; cover_image_url: string | null }[] = [];

    for (const item of listItems.slice(0, 3)) {
      if (item.book_id) {
        const book = coverBooksMap.get(item.book_id);
        if (book) coverBooks.push(book);
      } else if (item.external_title) {
        coverBooks.push({
          title: item.external_title,
          author: item.external_author ?? "Unknown",
          cover_image_url: item.external_cover_url,
        });
      }
    }

    return {
      ...list,
      book_count: listItems.length,
      cover_book: coverBooks[0] ?? null,
      cover_books: coverBooks,
    };
  });
}

export async function fetchSyllabus(id: string): Promise<List | null> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchSyllabusItems(
  listId: string,
): Promise<SyllabusItemWithBook[]> {
  const { data, error } = await supabase
    .from("list_items")
    .select("*, book:books(*)")
    .eq("list_id", listId)
    .order("position");

  if (error) throw error;
  return (data ?? []) as SyllabusItemWithBook[];
}

export async function createSyllabus(
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

export async function updateSyllabus(
  id: string,
  fields: Partial<Pick<List, "name" | "description">>,
): Promise<void> {
  const { error } = await supabase.from("lists").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteSyllabus(id: string): Promise<void> {
  const { error } = await supabase.from("lists").delete().eq("id", id);
  if (error) throw error;
}

async function getNextPosition(listId: string): Promise<number> {
  const { data, error } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0]?.position ?? 0) + 1;
}

export async function addSyllabusItem(
  listId: string,
  bookId: string,
  rationale?: string | null,
): Promise<ListItem | null> {
  const nextPosition = await getNextPosition(listId);

  const { data, error } = await supabase
    .from("list_items")
    .insert({
      list_id: listId,
      book_id: bookId,
      position: nextPosition,
      rationale: rationale ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return null; // duplicate
    throw error;
  }
  return data;
}

export async function addExternalItem(
  listId: string,
  title: string,
  author: string | null,
  coverUrl: string | null,
  isbn: string | null,
  rationale?: string | null,
): Promise<ListItem | null> {
  const nextPosition = await getNextPosition(listId);

  const { data, error } = await supabase
    .from("list_items")
    .insert({
      list_id: listId,
      book_id: null,
      position: nextPosition,
      rationale: rationale ?? null,
      external_title: title,
      external_author: author,
      external_cover_url: coverUrl,
      external_isbn: isbn,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return null; // duplicate external entry
    throw error;
  }
  return data;
}

export async function removeSyllabusItem(
  listId: string,
  itemId: string,
): Promise<void> {
  const { data: removed, error: fetchError } = await supabase
    .from("list_items")
    .select("position")
    .eq("id", itemId)
    .single();

  if (fetchError) throw fetchError;

  const { error: deleteError } = await supabase
    .from("list_items")
    .delete()
    .eq("id", itemId);

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

export async function reorderSyllabusItem(
  listId: string,
  itemId: string,
  newPosition: number,
): Promise<void> {
  const { data: items, error } = await supabase
    .from("list_items")
    .select("id, position")
    .eq("list_id", listId)
    .order("position");

  if (error) throw error;
  if (!items || items.length === 0) return;

  const targetIdx = items.findIndex((item) => item.id === itemId);
  if (targetIdx === -1) return;

  const [target] = items.splice(targetIdx, 1);
  const insertIdx = Math.max(0, Math.min(newPosition - 1, items.length));
  items.splice(insertIdx, 0, target);

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

export async function updateItemRationale(
  itemId: string,
  rationale: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("list_items")
    .update({ rationale })
    .eq("id", itemId);

  if (error) throw error;
}
