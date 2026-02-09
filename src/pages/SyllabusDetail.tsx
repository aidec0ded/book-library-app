import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  SyllabusSearchModal,
  type ExternalBook,
} from "@/components/SyllabusSearchModal";
import {
  fetchSyllabus,
  fetchSyllabusItems,
  updateSyllabus,
  deleteSyllabus,
  addSyllabusItem,
  addExternalItem,
  removeSyllabusItem,
  reorderSyllabusItem,
  updateItemRationale,
  type SyllabusItemWithBook,
} from "@/lib/lists";
import type { Book, List } from "@/lib/types";

type EditingField = "name" | "description";

export function SyllabusDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [syllabus, setSyllabus] = useState<List | null>(null);
  const [items, setItems] = useState<SyllabusItemWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Track which item is being rationale-edited
  const [editingRationaleId, setEditingRationaleId] = useState<string | null>(null);
  const [rationaleDraft, setRationaleDraft] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [listData, itemsData] = await Promise.all([
          fetchSyllabus(id!),
          fetchSyllabusItems(id!),
        ]);
        setSyllabus(listData);
        setItems(itemsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load syllabus");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  const handleStartEdit = useCallback(
    (field: EditingField) => {
      if (!syllabus) return;
      setEditingField(field);
      setEditDraft(syllabus[field] ?? "");
    },
    [syllabus],
  );

  const handleSaveEdit = useCallback(
    async (field: EditingField) => {
      if (!syllabus) return;
      const trimmed = editDraft.trim();
      const value = field === "name" ? (trimmed || syllabus.name) : (trimmed || null);

      setEditingField(null);
      const prev = syllabus[field];
      setSyllabus({ ...syllabus, [field]: value });

      try {
        await updateSyllabus(syllabus.id, { [field]: value });
      } catch {
        setSyllabus({ ...syllabus, [field]: prev });
        setSaveError(`Failed to save ${field}`);
      }
    },
    [syllabus, editDraft],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
    setEditDraft("");
  }, []);

  const handleAddLibraryBook = useCallback(
    async (book: Book) => {
      if (!syllabus) return;
      setShowSearch(false);

      const nextPosition = items.length > 0 ? items[items.length - 1].position + 1 : 1;

      const tempItem: SyllabusItemWithBook = {
        id: crypto.randomUUID(),
        list_id: syllabus.id,
        book_id: book.id,
        position: nextPosition,
        added_at: new Date().toISOString(),
        rationale: null,
        external_title: null,
        external_author: null,
        external_cover_url: null,
        external_isbn: null,
        book,
      };
      setItems((prev) => [...prev, tempItem]);

      try {
        const result = await addSyllabusItem(syllabus.id, book.id);
        if (result === null) {
          setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        } else {
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
    [syllabus, items],
  );

  const handleAddExternalBook = useCallback(
    async (ext: ExternalBook) => {
      if (!syllabus) return;
      setShowSearch(false);

      const nextPosition = items.length > 0 ? items[items.length - 1].position + 1 : 1;

      const tempItem: SyllabusItemWithBook = {
        id: crypto.randomUUID(),
        list_id: syllabus.id,
        book_id: null,
        position: nextPosition,
        added_at: new Date().toISOString(),
        rationale: null,
        external_title: ext.title,
        external_author: ext.author,
        external_cover_url: ext.coverUrl,
        external_isbn: ext.isbn,
        book: null,
      };
      setItems((prev) => [...prev, tempItem]);

      try {
        const result = await addExternalItem(
          syllabus.id,
          ext.title,
          ext.author,
          ext.coverUrl,
          ext.isbn,
        );
        if (result === null) {
          setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        } else {
          setItems((prev) =>
            prev.map((i) =>
              i.id === tempItem.id ? { ...result, book: null } : i,
            ),
          );
        }
      } catch {
        setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        setSaveError("Failed to add item");
      }
    },
    [syllabus, items],
  );

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      if (!syllabus) return;

      const prevItems = items;
      const newItems = items
        .filter((i) => i.id !== itemId)
        .map((item, idx) => ({ ...item, position: idx + 1 }));
      setItems(newItems);

      try {
        await removeSyllabusItem(syllabus.id, itemId);
      } catch {
        setItems(prevItems);
        setSaveError("Failed to remove item");
      }
    },
    [syllabus, items],
  );

  const handleMove = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      if (!syllabus) return;

      const idx = items.findIndex((i) => i.id === itemId);
      if (idx === -1) return;

      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= items.length) return;

      const prevItems = items;
      const newItems = [...items];
      [newItems[idx], newItems[newIdx]] = [newItems[newIdx], newItems[idx]];
      const renumbered = newItems.map((item, i) => ({
        ...item,
        position: i + 1,
      }));
      setItems(renumbered);

      try {
        await reorderSyllabusItem(syllabus.id, itemId, newIdx + 1);
      } catch {
        setItems(prevItems);
        setSaveError("Failed to reorder");
      }
    },
    [syllabus, items],
  );

  const handleStartRationale = useCallback((itemId: string, current: string | null) => {
    setEditingRationaleId(itemId);
    setRationaleDraft(current ?? "");
  }, []);

  const handleSaveRationale = useCallback(
    async (itemId: string) => {
      const trimmed = rationaleDraft.trim();
      const value = trimmed || null;

      setEditingRationaleId(null);
      const prevItems = items;
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, rationale: value } : i)),
      );

      try {
        await updateItemRationale(itemId, value);
      } catch {
        setItems(prevItems);
        setSaveError("Failed to save rationale");
      }
    },
    [rationaleDraft, items],
  );

  const handleDeleteSyllabus = useCallback(async () => {
    if (!syllabus) return;
    if (!window.confirm(`Delete "${syllabus.name}"? This cannot be undone.`)) return;

    try {
      await deleteSyllabus(syllabus.id);
      navigate("/syllabi");
    } catch {
      setSaveError("Failed to delete syllabus");
    }
  }, [syllabus, navigate]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !syllabus) {
    return (
      <div className="space-y-2">
        <div className="text-destructive">{error ?? "Syllabus not found."}</div>
        <Link to="/syllabi" className="text-sm underline">
          All Syllabi
        </Link>
      </div>
    );
  }

  const itemTitle = (item: SyllabusItemWithBook) =>
    item.book?.title ?? item.external_title ?? "Untitled";
  const itemAuthor = (item: SyllabusItemWithBook) =>
    item.book?.author ?? item.external_author ?? "Unknown";
  const isExternal = (item: SyllabusItemWithBook) => item.book_id === null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        to="/syllabi"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Syllabi
      </Link>

      {saveError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Header section */}
      <div className="space-y-3">
        {/* Editable name */}
        {editingField === "name" ? (
          <div className="space-y-2">
            <Input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              autoFocus
              className="font-serif text-3xl font-medium italic"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit("name");
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveEdit("name")}
                className="rounded-md bg-accent px-3 py-1 text-sm text-accent-foreground hover:bg-accent/90"
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
            className="cursor-pointer rounded-md px-1 py-0.5 -mx-1 font-serif text-4xl font-medium italic tracking-tight hover:bg-muted/50"
            onClick={() => handleStartEdit("name")}
          >
            {syllabus.name}
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
              className="font-serif text-lg"
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveEdit("description")}
                className="rounded-md bg-accent px-3 py-1 text-sm text-accent-foreground hover:bg-accent/90"
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
            {syllabus.description ? (
              <p className="font-serif text-lg leading-relaxed text-muted-foreground">
                {syllabus.description}
              </p>
            ) : (
              <p className="font-serif text-lg italic text-muted-foreground/50">
                Click to add a description...
              </p>
            )}
          </div>
        )}
      </div>

      {/* List container */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* List header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Reading List &middot; {items.length} {items.length === 1 ? "Item" : "Items"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent/80"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
            <button
              onClick={handleDeleteSyllabus}
              className="text-sm text-muted-foreground hover:text-destructive"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No items yet. Click "Add Item" to get started.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item, idx) => (
              <li
                key={item.id}
                className={`group relative flex items-start gap-6 p-6 transition-colors hover:bg-muted/30 ${
                  isExternal(item) ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                }`}
              >
                {/* Number */}
                <div className="w-8 shrink-0 pt-1">
                  <span className={`font-serif text-2xl font-medium italic ${
                    isExternal(item)
                      ? "text-accent/40"
                      : "text-muted-foreground/40"
                  }`}>
                    {String(item.position).padStart(2, "0")}
                  </span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        {item.book ? (
                          <Link
                            to={`/books/${item.book.id}`}
                            className="font-serif text-xl font-medium hover:text-accent"
                          >
                            {item.book.title}
                          </Link>
                        ) : (
                          <span className="font-serif text-xl font-medium">
                            {item.external_title}
                          </span>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">
                          {itemAuthor(item)}
                        </p>
                      </div>
                      {isExternal(item) && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-100 bg-background px-2.5 py-1 text-xs font-semibold text-amber-600 dark:border-amber-900/50 dark:text-amber-400">
                          Not in library
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rationale */}
                  {editingRationaleId === item.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={rationaleDraft}
                        onChange={(e) => setRationaleDraft(e.target.value)}
                        autoFocus
                        rows={2}
                        placeholder="Why does this book belong here?"
                        className="text-sm italic"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingRationaleId(null);
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveRationale(item.id)}
                          className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground hover:bg-accent/90"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRationaleId(null)}
                          className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : item.rationale ? (
                    <div
                      className="cursor-pointer border-l-2 border-accent/30 pl-4"
                      onClick={() => handleStartRationale(item.id, item.rationale)}
                    >
                      <p className="text-sm font-medium italic leading-relaxed text-muted-foreground">
                        {item.rationale}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartRationale(item.id, null)}
                      className="text-sm italic text-muted-foreground/50 hover:text-muted-foreground"
                    >
                      Add rationale...
                    </button>
                  )}

                  {/* External item actions */}
                  {isExternal(item) && item.external_isbn && (
                    <div className="flex gap-3 pt-1">
                      <a
                        href={`https://bookshop.org/p/books/-/${item.external_isbn}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold underline decoration-accent/30 decoration-2 underline-offset-4 hover:text-accent"
                      >
                        Acquire Copy
                      </a>
                    </div>
                  )}
                </div>

                {/* Hover actions */}
                <div className="absolute right-4 top-6 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {idx > 0 && (
                    <button
                      onClick={() => handleMove(item.id, "up")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                  )}
                  {idx < items.length - 1 && (
                    <button
                      onClick={() => handleMove(item.id, "down")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showSearch && (
        <SyllabusSearchModal
          onSelectLibraryBook={handleAddLibraryBook}
          onSelectExternalBook={handleAddExternalBook}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
