import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookSearchModal } from "@/components/BookSearchModal";
import {
  fetchList,
  fetchListItems,
  updateList,
  deleteList,
  addListItem,
  removeListItem,
  reorderListItem,
} from "@/lib/lists";
import type { Book, List, ListItem } from "@/lib/types";

type ListItemWithBook = ListItem & { book: Book };

type EditingField = "name" | "description";

export function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItemWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [listData, itemsData] = await Promise.all([
          fetchList(id!),
          fetchListItems(id!),
        ]);
        setList(listData);
        setItems(itemsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load list");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  // Auto-clear save errors after 4 seconds
  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  const handleStartEdit = useCallback(
    (field: EditingField) => {
      if (!list) return;
      setEditingField(field);
      setEditDraft(list[field] ?? "");
    },
    [list],
  );

  const handleSaveEdit = useCallback(
    async (field: EditingField) => {
      if (!list) return;
      const trimmed = editDraft.trim();
      const value = field === "name" ? (trimmed || list.name) : (trimmed || null);

      setEditingField(null);
      const prev = list[field];
      setList({ ...list, [field]: value });

      try {
        await updateList(list.id, { [field]: value });
      } catch {
        setList({ ...list, [field]: prev });
        setSaveError(`Failed to save ${field}`);
      }
    },
    [list, editDraft],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
    setEditDraft("");
  }, []);

  const handleAddBook = useCallback(
    async (book: Book) => {
      if (!list) return;
      setShowSearch(false);

      const nextPosition = items.length > 0 ? items[items.length - 1].position + 1 : 1;

      // Optimistic add
      const tempItem: ListItemWithBook = {
        id: crypto.randomUUID(),
        list_id: list.id,
        book_id: book.id,
        position: nextPosition,
        added_at: new Date().toISOString(),
        book,
      };
      setItems((prev) => [...prev, tempItem]);

      try {
        const result = await addListItem(list.id, book.id);
        if (result === null) {
          // Duplicate — remove optimistic item
          setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        } else {
          // Replace temp with real item
          setItems((prev) =>
            prev.map((i) =>
              i.id === tempItem.id ? { ...result, book } : i,
            ),
          );
        }
      } catch {
        setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        setSaveError("Failed to add book");
      }
    },
    [list, items],
  );

  const handleRemoveBook = useCallback(
    async (bookId: string) => {
      if (!list) return;

      const prevItems = items;
      const removedIdx = items.findIndex((i) => i.book_id === bookId);
      if (removedIdx === -1) return;

      // Optimistic remove + renormalize positions
      const newItems = items
        .filter((i) => i.book_id !== bookId)
        .map((item, idx) => ({ ...item, position: idx + 1 }));
      setItems(newItems);

      try {
        await removeListItem(list.id, bookId);
      } catch {
        setItems(prevItems);
        setSaveError("Failed to remove book");
      }
    },
    [list, items],
  );

  const handleMove = useCallback(
    async (bookId: string, direction: "up" | "down") => {
      if (!list) return;

      const idx = items.findIndex((i) => i.book_id === bookId);
      if (idx === -1) return;

      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= items.length) return;

      // Optimistic swap
      const prevItems = items;
      const newItems = [...items];
      [newItems[idx], newItems[newIdx]] = [newItems[newIdx], newItems[idx]];
      const renumbered = newItems.map((item, i) => ({
        ...item,
        position: i + 1,
      }));
      setItems(renumbered);

      try {
        await reorderListItem(list.id, bookId, newIdx + 1);
      } catch {
        setItems(prevItems);
        setSaveError("Failed to reorder");
      }
    },
    [list, items],
  );

  const handleDeleteList = useCallback(async () => {
    if (!list) return;
    if (!window.confirm(`Delete "${list.name}"? This cannot be undone.`)) return;

    try {
      await deleteList(list.id);
      navigate("/lists");
    } catch {
      setSaveError("Failed to delete list");
    }
  }, [list, navigate]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !list) {
    return (
      <div className="space-y-2">
        <div className="text-destructive">{error ?? "List not found."}</div>
        <Link to="/lists" className="text-sm underline">
          All Lists
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/lists"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Lists
      </Link>

      {saveError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Editable name */}
      {editingField === "name" ? (
        <div className="space-y-2">
          <Input
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            autoFocus
            className="text-2xl font-bold"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit("name");
              if (e.key === "Escape") handleCancelEdit();
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleSaveEdit("name")}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <h1
          className="cursor-pointer rounded-md px-1 py-0.5 -mx-1 text-3xl font-bold tracking-tight hover:bg-muted/50"
          onClick={() => handleStartEdit("name")}
        >
          {list.name}
        </h1>
      )}

      {/* Editable description */}
      {editingField === "description" ? (
        <div className="space-y-2">
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            autoFocus
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancelEdit();
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleSaveEdit("description")}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50"
          onClick={() => handleStartEdit("description")}
        >
          {list.description ? (
            <p className="text-sm text-muted-foreground">{list.description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Click to add a description...
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "book" : "books"}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Book
          </button>
          <button
            onClick={handleDeleteList}
            className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            Delete List
          </button>
        </div>
      </div>

      {/* Book list */}
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No books in this list yet. Click "Add Book" to get started.
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="w-6 shrink-0 text-center text-sm font-medium text-muted-foreground">
                {item.position}
              </span>
              {item.book.cover_image_url ? (
                <img
                  src={item.book.cover_image_url}
                  alt=""
                  className="h-10 w-7 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to={`/books/${item.book.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {item.book.title}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {item.book.author}
                </div>
              </div>
              {item.book.status && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {item.book.status}
                </Badge>
              )}
              <div className="flex shrink-0 items-center gap-0.5">
                {idx > 0 && (
                  <button
                    onClick={() => handleMove(item.book_id, "up")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                )}
                {idx < items.length - 1 && (
                  <button
                    onClick={() => handleMove(item.book_id, "down")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleRemoveBook(item.book_id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSearch && (
        <BookSearchModal
          onSelect={handleAddBook}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
