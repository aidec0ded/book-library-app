import { supabase } from "@/lib/supabase";
import { fetchBookIdsByCanonicalVibes } from "@/lib/vibes";
import type {
  Book,
  Shelf,
  ShelfFilter,
  ShelfItem,
  ShelfWithCover,
} from "@/lib/types";

export type ShelfBook = Pick<
  Book,
  "id" | "title" | "author" | "cover_image_url"
>;

async function buildAutoShelfQuery(filter: ShelfFilter) {
  let q = supabase
    .from("books")
    .select("id, title, author, cover_image_url");

  if (filter.status) {
    q = q.eq("status", filter.status);
  }
  if (filter.genre) {
    q = q.eq("genre", filter.genre);
  }
  if (filter.rating_min != null) {
    q = q.gte("rating", filter.rating_min);
  }
  if (filter.timing_month != null) {
    q = q.eq("timing_month", filter.timing_month);
  }
  if (filter.is_favorite) {
    q = q.eq("is_favorite", true);
  }
  // Vibe filtering requires a pre-query
  if (filter.vibes && filter.vibes.length > 0) {
    const ids = await fetchBookIdsByCanonicalVibes(filter.vibes);
    if (ids.length === 0) return null;
    q = q.in("id", ids);
  }

  q = q.order("title");
  return q;
}

export async function fetchShelves(): Promise<ShelfWithCover[]> {
  const { data: shelves, error: shelvesError } = await supabase
    .from("shelves")
    .select("*")
    .order("created_at", { ascending: false });

  if (shelvesError) throw shelvesError;
  if (!shelves || shelves.length === 0) return [];

  // Fetch all shelf_items for counts and cover books
  const { data: items, error: itemsError } = await supabase
    .from("shelf_items")
    .select("shelf_id, book_id, position")
    .order("position");

  if (itemsError) throw itemsError;

  // Group items by shelf
  const shelfItemsMap = new Map<
    string,
    { book_id: string; position: number }[]
  >();
  for (const item of items ?? []) {
    const list = shelfItemsMap.get(item.shelf_id) ?? [];
    list.push({ book_id: item.book_id, position: item.position });
    shelfItemsMap.set(item.shelf_id, list);
  }

  // Collect all first-position book IDs for cover books (manual shelves)
  const coverBookIds = new Set<string>();
  for (const [, shelfItems] of shelfItemsMap) {
    if (shelfItems.length > 0) {
      const sorted = shelfItems.sort((a, b) => a.position - b.position);
      coverBookIds.add(sorted[0].book_id);
    }
  }

  // Fetch cover books in one query
  const coverBooksMap = new Map<string, ShelfBook>();
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

  const results: ShelfWithCover[] = [];

  for (const shelf of shelves) {
    if (shelf.shelf_type === "auto" && shelf.filter) {
      // Auto shelf: execute the filter query
      const q = await buildAutoShelfQuery(shelf.filter as ShelfFilter);
      if (q === null) {
        results.push({ ...shelf, book_count: 0, cover_book: null });
        continue;
      }
      const { data, error } = await q;
      if (error) throw error;
      const books = data ?? [];
      results.push({
        ...shelf,
        book_count: books.length,
        cover_book: books.length > 0 ? books[0] : null,
      });
    } else {
      // Manual shelf
      const shelfItems = shelfItemsMap.get(shelf.id) ?? [];
      const firstItem = shelfItems.sort(
        (a, b) => a.position - b.position,
      )[0];
      const coverBook = firstItem
        ? coverBooksMap.get(firstItem.book_id) ?? null
        : null;
      results.push({
        ...shelf,
        book_count: shelfItems.length,
        cover_book: coverBook,
      });
    }
  }

  return results;
}

export async function fetchShelf(id: string): Promise<Shelf | null> {
  const { data, error } = await supabase
    .from("shelves")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchShelfBooks(shelf: Shelf): Promise<ShelfBook[]> {
  if (shelf.shelf_type === "auto" && shelf.filter) {
    const q = await buildAutoShelfQuery(shelf.filter);
    if (q === null) return [];
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  // Manual shelf: join through shelf_items
  const { data, error } = await supabase
    .from("shelf_items")
    .select("*, book:books(id, title, author, cover_image_url)")
    .eq("shelf_id", shelf.id)
    .order("position");

  if (error) throw error;
  return (data ?? []).map(
    (item: { book: ShelfBook }) => item.book,
  );
}

export async function createShelf(
  name: string,
  description: string | null,
  shelfType: "manual" | "auto",
  filter?: ShelfFilter | null,
): Promise<Shelf> {
  const { data, error } = await supabase
    .from("shelves")
    .insert({
      name,
      description,
      shelf_type: shelfType,
      filter: filter ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateShelf(
  id: string,
  fields: Partial<Pick<Shelf, "name" | "description" | "filter">>,
): Promise<void> {
  const { error } = await supabase.from("shelves").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteShelf(id: string): Promise<void> {
  const { error } = await supabase.from("shelves").delete().eq("id", id);
  if (error) throw error;
}

export async function addShelfItem(
  shelfId: string,
  bookId: string,
): Promise<ShelfItem | null> {
  // Get max position
  const { data: existing, error: fetchError } = await supabase
    .from("shelf_items")
    .select("position")
    .eq("shelf_id", shelfId)
    .order("position", { ascending: false })
    .limit(1);

  if (fetchError) throw fetchError;

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("shelf_items")
    .insert({ shelf_id: shelfId, book_id: bookId, position: nextPosition })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

export async function removeShelfItem(
  shelfId: string,
  bookId: string,
): Promise<void> {
  const { data: removed, error: fetchError } = await supabase
    .from("shelf_items")
    .select("position")
    .eq("shelf_id", shelfId)
    .eq("book_id", bookId)
    .single();

  if (fetchError) throw fetchError;

  const { error: deleteError } = await supabase
    .from("shelf_items")
    .delete()
    .eq("shelf_id", shelfId)
    .eq("book_id", bookId);

  if (deleteError) throw deleteError;

  // Decrement positions of items after the removed one
  const { data: after, error: afterError } = await supabase
    .from("shelf_items")
    .select("id, position")
    .eq("shelf_id", shelfId)
    .gt("position", removed.position);

  if (afterError) throw afterError;

  await Promise.all(
    (after ?? []).map((item) =>
      supabase
        .from("shelf_items")
        .update({ position: item.position - 1 })
        .eq("id", item.id),
    ),
  );
}
