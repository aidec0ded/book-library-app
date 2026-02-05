import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings, Plus, X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/BookCover";
import { BookSearchModal } from "@/components/BookSearchModal";
import { ShelfFilterBuilder } from "@/components/ShelfFilterBuilder";
import {
  fetchShelf,
  fetchShelfBooks,
  updateShelf,
  deleteShelf,
  addShelfItem,
  removeShelfItem,
} from "@/lib/shelves";
import type { ShelfBook } from "@/lib/shelves";
import type { Book, Shelf, ShelfFilter } from "@/lib/types";

interface ShelfCarouselProps {
  shelf: Shelf;
  onClose: () => void;
}

export function ShelfCarousel({ shelf: initialShelf, onClose }: ShelfCarouselProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [shelf, setShelf] = useState<Shelf>(initialShelf);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setNameDraft] = useState(shelf.name);
  const [descDraft, setDescDraft] = useState(shelf.description ?? "");
  const [filterDraft, setFilterDraft] = useState<ShelfFilter>(
    (shelf.filter as ShelfFilter) ?? {},
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      // Re-fetch shelf to get latest filter
      const latest = await fetchShelf(shelf.id);
      if (latest) {
        setShelf(latest);
        const data = await fetchShelfBooks(latest);
        setBooks(data);
        setFilterDraft((latest.filter as ShelfFilter) ?? {});
      }
    } catch (err) {
      console.error("Error fetching shelf books:", err);
    } finally {
      setLoading(false);
    }
  }, [shelf.id]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // Auto-clear save errors
  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  // Focus tracking on scroll
  const updateFocus = useCallback(() => {
    const container = scrollRef.current;
    if (!container || books.length === 0) return;

    const containerCenter =
      container.scrollLeft + container.clientWidth / 2;
    let closest = 0;
    let minDist = Infinity;

    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(containerCenter - childCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }

    setFocusedIndex(closest);
  }, [books.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let raf: number;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateFocus);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [updateFocus]);

  // Scroll to a specific index
  function scrollToIndex(idx: number) {
    const container = scrollRef.current;
    if (!container) return;
    const child = container.children[idx] as HTMLElement | undefined;
    if (!child) return;
    const targetScroll =
      child.offsetLeft - container.clientWidth / 2 + child.offsetWidth / 2;
    container.scrollTo({ left: targetScroll, behavior: "smooth" });
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showSearch || editingName || editingDesc) return;

      if (e.key === "Escape") {
        if (showSettings) {
          setShowSettings(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newIdx = Math.max(0, focusedIndex - 1);
        scrollToIndex(newIdx);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const newIdx = Math.min(books.length - 1, focusedIndex + 1);
        scrollToIndex(newIdx);
      }
      if (e.key === "Enter" && books[focusedIndex]) {
        navigate(`/books/${books[focusedIndex].id}`);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedIndex,
    books,
    showSettings,
    showSearch,
    editingName,
    editingDesc,
    navigate,
    onClose,
  ]);

  // Handlers
  async function handleSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setEditingName(false);
    const prev = shelf.name;
    setShelf({ ...shelf, name: trimmed });
    try {
      await updateShelf(shelf.id, { name: trimmed });
    } catch {
      setShelf({ ...shelf, name: prev });
      setSaveError("Failed to save name");
    }
  }

  async function handleSaveDesc() {
    setEditingDesc(false);
    const value = descDraft.trim() || null;
    const prev = shelf.description;
    setShelf({ ...shelf, description: value });
    try {
      await updateShelf(shelf.id, { description: value });
    } catch {
      setShelf({ ...shelf, description: prev });
      setSaveError("Failed to save description");
    }
  }

  async function handleSaveFilter() {
    try {
      await updateShelf(shelf.id, { filter: filterDraft });
      setShelf({ ...shelf, filter: filterDraft });
      await loadBooks();
    } catch {
      setSaveError("Failed to save filter");
    }
  }

  async function handleAddBook(book: Book) {
    setShowSearch(false);
    const tempBook: ShelfBook = {
      id: book.id,
      title: book.title,
      author: book.author,
      cover_image_url: book.cover_image_url,
    };
    setBooks((prev) => [...prev, tempBook]);

    try {
      const result = await addShelfItem(shelf.id, book.id);
      if (result === null) {
        // Duplicate — remove the optimistic addition
        setBooks((prev) => prev.filter((b) => b.id !== book.id || prev.indexOf(b) !== prev.length - 1));
      }
    } catch {
      setBooks((prev) => prev.slice(0, -1));
      setSaveError("Failed to add book");
    }
  }

  async function handleRemoveFocused() {
    const book = books[focusedIndex];
    if (!book) return;

    const prevBooks = books;
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    setFocusedIndex((prev) => Math.min(prev, books.length - 2));

    try {
      await removeShelfItem(shelf.id, book.id);
    } catch {
      setBooks(prevBooks);
      setSaveError("Failed to remove book");
    }
  }

  async function handleDeleteShelf() {
    if (!window.confirm(`Delete "${shelf.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteShelf(shelf.id);
      onClose();
    } catch {
      setSaveError("Failed to delete shelf");
    }
  }

  const focusedBook = books[focusedIndex] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h2 className="font-serif text-lg font-semibold">{shelf.name}</h2>
        <button
          onClick={() => setShowSettings((o) => !o)}
          className={`rounded-md p-2 transition-colors ${
            showSettings
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="space-y-3 border-b px-4 py-4">
          {/* Name */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameDraft(shelf.name);
                  }
                }}
              />
              <button
                onClick={handleSaveName}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(shelf.name);
                }}
                className="shrink-0 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNameDraft(shelf.name);
                setEditingName(true);
              }}
              className="rounded-md px-1 py-0.5 text-sm font-medium hover:bg-muted/50"
            >
              {shelf.name}
              <span className="ml-2 text-xs text-muted-foreground">
                (click to edit)
              </span>
            </button>
          )}

          {/* Description */}
          {editingDesc ? (
            <div className="space-y-2">
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingDesc(false);
                    setDescDraft(shelf.description ?? "");
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDesc}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingDesc(false);
                    setDescDraft(shelf.description ?? "");
                  }}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setDescDraft(shelf.description ?? "");
                setEditingDesc(true);
              }}
              className="rounded-md px-1 py-0.5 text-sm text-muted-foreground hover:bg-muted/50"
            >
              {shelf.description || "Add description..."}
            </button>
          )}

          {/* Auto shelf filter editor */}
          {shelf.shelf_type === "auto" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Filter Rules
              </p>
              <ShelfFilterBuilder
                filter={filterDraft}
                onChange={setFilterDraft}
              />
              <button
                onClick={handleSaveFilter}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                Apply Filter
              </button>
            </div>
          )}

          {/* Manual shelf actions */}
          {shelf.shelf_type === "manual" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearch(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3 w-3" />
                Add Book
              </button>
              {focusedBook && (
                <button
                  onClick={handleRemoveFocused}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                  Remove "{focusedBook.title}"
                </button>
              )}
            </div>
          )}

          {/* Delete */}
          <button
            onClick={handleDeleteShelf}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" />
            Delete Shelf
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-hidden">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : books.length === 0 ? (
          <div className="space-y-2 text-center">
            <p className="text-muted-foreground">This shelf is empty.</p>
            {shelf.shelf_type === "manual" ? (
              <button
                onClick={() => {
                  setShowSettings(true);
                  setShowSearch(true);
                }}
                className="text-sm text-primary hover:underline"
              >
                Add books
              </button>
            ) : (
              <button
                onClick={() => setShowSettings(true)}
                className="text-sm text-primary hover:underline"
              >
                Adjust filter
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Carousel */}
            <div
              ref={scrollRef}
              className="flex w-full items-center gap-8 overflow-x-auto snap-x snap-mandatory scroll-smooth"
              style={{
                paddingLeft: "calc(50vw - 100px)",
                paddingRight: "calc(50vw - 100px)",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {books.map((book, i) => {
                const distance = Math.abs(i - focusedIndex);
                let scale = 1;
                let opacity = 1;
                if (distance === 1) {
                  scale = 0.75;
                  opacity = 0.85;
                } else if (distance === 2) {
                  scale = 0.6;
                  opacity = 0.6;
                } else if (distance >= 3) {
                  scale = 0.5;
                  opacity = 0.3;
                }

                return (
                  <div
                    key={book.id}
                    className="shrink-0 snap-center cursor-pointer"
                    style={{
                      width: "200px",
                      transform: `scale(${scale})`,
                      opacity,
                      transition: "transform 300ms ease, opacity 300ms ease",
                    }}
                    onClick={() => {
                      if (i === focusedIndex) {
                        navigate(`/books/${book.id}`);
                      } else {
                        scrollToIndex(i);
                      }
                    }}
                  >
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.cover_image_url}
                      size="lg"
                      className="w-[200px]"
                    />
                  </div>
                );
              })}
            </div>

            {/* Info panel */}
            <div className="mt-6 text-center">
              {focusedBook && (
                <>
                  <p className="font-serif text-xl font-semibold">
                    {focusedBook.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {focusedBook.author}
                  </p>
                </>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {focusedIndex + 1} of {books.length}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Book search modal */}
      {showSearch && (
        <BookSearchModal
          onSelect={handleAddBook}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Hide scrollbar with CSS */}
      <style>{`
        div[class*="overflow-x-auto"]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
