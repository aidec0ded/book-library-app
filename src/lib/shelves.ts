import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
import type {
  Book,
  Shelf,
  ShelfFilter,
  ShelfItem,
  ShelfWithCover,
  TagCategory,
} from "@/lib/types";

export type ShelfBook = Pick<
  Book,
  "id" | "title" | "author" | "cover_image_url" | "status" | "rating" | "book_type" | "page_count" | "is_favorite" | "summary"
>;

const SHELF_BOOK_FIELDS = "id, title, author, cover_image_url, status, rating, book_type, page_count, is_favorite, summary";

/**
 * Every book an auto shelf's filter matches, page by page (a shelf of read books passes
 * 1,000 for a heavy reader). Tag rules join to the tags in the same query, one alias per
 * category: OR within a category, AND across them.
 */
async function fetchAutoShelfBooks(filter: ShelfFilter): Promise<ShelfBook[]> {
  const tagFilters: { tags: string[]; category: TagCategory }[] = [];
  if (filter.vibes?.length) tagFilters.push({ tags: filter.vibes, category: "vibe" });
  if (filter.topics?.length) tagFilters.push({ tags: filter.topics, category: "topic" });
  if (filter.form?.length) tagFilters.push({ tags: filter.form, category: "form" });
  if (filter.depth?.length) tagFilters.push({ tags: filter.depth, category: "depth" });
  if (filter.movement?.length) tagFilters.push({ tags: filter.movement, category: "movement" });
  if (filter.formal_feel?.length) tagFilters.push({ tags: filter.formal_feel, category: "formal_feel" });
  if (filter.accessibility?.length) tagFilters.push({ tags: filter.accessibility, category: "accessibility" });

  const joins = tagFilters.map((_, i) => `t${i}:book_vibes!inner(vibe)`);
  const select = [SHELF_BOOK_FIELDS, ...joins].join(", ");

  const rows = await fetchAllRows<ShelfBook & Record<string, unknown>>((from, to) => {
    let q = supabase.from("books").select(select);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.genre) q = q.eq("genre", filter.genre);
    if (filter.rating_min != null) q = q.gte("rating", filter.rating_min);
    if (filter.book_type) q = q.eq("book_type", filter.book_type);
    if (filter.is_favorite) q = q.eq("is_favorite", true);
    tagFilters.forEach(({ tags, category }, i) => {
      q = q.in(`t${i}.vibe`, tags).eq(`t${i}.tag_category`, category).eq(`t${i}.is_canonical`, true);
    });
    return q.order("title").order("id").range(from, to) as unknown as PromiseLike<{
      data: (ShelfBook & Record<string, unknown>)[] | null;
      error: unknown;
    }>;
  });
  // Drop the joined tag rows, which only did the filtering
  return rows.map((row) => {
    const book = { ...row };
    tagFilters.forEach((_, i) => delete book[`t${i}`]);
    return book as ShelfBook;
  });
}

export async function fetchShelves(): Promise<ShelfWithCover[]> {
  // Fetch shelves and shelf_items in parallel
  const [shelvesResult, itemsResult] = await Promise.all([
    supabase
      .from("shelves")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("shelf_items")
      .select("shelf_id, book_id, position")
      .order("position"),
  ]);

  if (shelvesResult.error) throw shelvesResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const shelves = shelvesResult.data;
  const items = itemsResult.data;

  if (!shelves || shelves.length === 0) return [];

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

  // Collect top-3 book IDs per shelf for cover display (manual shelves)
  const coverBookIds = new Set<string>();
  for (const [, shelfItems] of shelfItemsMap) {
    if (shelfItems.length > 0) {
      const sorted = shelfItems.sort((a, b) => a.position - b.position);
      for (const item of sorted.slice(0, 3)) {
        coverBookIds.add(item.book_id);
      }
    }
  }

  // Fetch cover books in one query
  const coverBooksMap = new Map<string, ShelfBook>();
  if (coverBookIds.size > 0) {
    const { data: coverBooks, error: coverError } = await supabase
      .from("books")
      .select("id, title, author, cover_image_url, status, rating, book_type, page_count, is_favorite, summary")
      .in("id", [...coverBookIds]);

    if (coverError) throw coverError;
    for (const book of coverBooks ?? []) {
      coverBooksMap.set(book.id, book);
    }
  }

  const results: ShelfWithCover[] = await Promise.all(
    shelves.map(async (shelf) => {
      if (shelf.shelf_type === "auto" && shelf.filter) {
        // Auto shelf: run its filter
        const books = await fetchAutoShelfBooks(shelf.filter as ShelfFilter);
        return {
          ...shelf,
          book_count: books.length,
          cover_book: books.length > 0 ? books[0] : null,
          cover_books: books.slice(0, 3),
        };
      } else {
        // Manual shelf
        const shelfItems = shelfItemsMap.get(shelf.id) ?? [];
        const sorted = [...shelfItems].sort((a, b) => a.position - b.position);
        const topBooks = sorted
          .slice(0, 3)
          .map((item) => coverBooksMap.get(item.book_id))
          .filter((b): b is ShelfBook => b != null);
        return {
          ...shelf,
          book_count: shelfItems.length,
          cover_book: topBooks[0] ?? null,
          cover_books: topBooks,
        };
      }
    }),
  );

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
    return fetchAutoShelfBooks(shelf.filter);
  }

  // Manual shelf: join through shelf_items
  const { data, error } = await supabase
    .from("shelf_items")
    .select("*, book:books(id, title, author, cover_image_url, status, rating, book_type, page_count, is_favorite, summary)")
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
