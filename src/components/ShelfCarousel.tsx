import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Plus,
  X,
  Trash2,
  Star,
  Heart,
  ChevronUp,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookSearchModal } from "@/components/BookSearchModal";
import { ShelfFilterBuilder } from "@/components/ShelfFilterBuilder";
import { fetchVibesForBook } from "@/lib/vibes";
import {
  fetchShelf,
  fetchShelfBooks,
  updateShelf,
  deleteShelf,
  addShelfItem,
  removeShelfItem,
} from "@/lib/shelves";
import type { ShelfBook } from "@/lib/shelves";
import type { Book, BookVibe, Shelf, ShelfFilter } from "@/lib/types";

interface ShelfCarouselProps {
  shelf: Shelf;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  reading: "Currently Reading",
  read: "Read",
  unread: "Unread",
  wishlist: "Wishlist",
  unfinished: "Unfinished",
};

// Tag categories by book type for the side panel
const TAG_CATEGORIES: Record<string, string[]> = {
  fiction: ["vibe"],
  nonfiction: ["topic", "form", "depth"],
  poetry: ["movement", "formal_feel", "accessibility"],
};

const TAG_CATEGORY_LABELS: Record<string, string> = {
  vibe: "Vibes",
  topic: "Topics",
  form: "Form",
  depth: "Depth",
  movement: "Movement",
  formal_feel: "Style",
  accessibility: "Accessibility",
};

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "...";
}

export function ShelfCarousel({ shelf: initialShelf, onClose }: ShelfCarouselProps) {
  const navigate = useNavigate();
  const stageRef = useRef<HTMLElement>(null);

  const [shelf, setShelf] = useState<Shelf>(initialShelf);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [vibes, setVibes] = useState<BookVibe[]>([]);

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

  // Fetch vibes when focused book changes
  useEffect(() => {
    const book = books[focusedIndex];
    if (!book) { setVibes([]); return; }
    let cancelled = false;
    fetchVibesForBook(book.id).then((v) => {
      if (!cancelled) setVibes(v);
    }).catch(() => {
      if (!cancelled) setVibes([]);
    });
    return () => { cancelled = true; };
  }, [focusedIndex, books]);

  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  // Navigation
  function goUp() {
    setFocusedIndex((i) => Math.max(0, i - 1));
  }
  function goDown() {
    setFocusedIndex((i) => Math.min(books.length - 1, i + 1));
  }

  // Scroll navigation (wheel)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let accumulated = 0;
    const THRESHOLD = 80; // pixels of scroll before advancing

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      accumulated += e.deltaY;

      if (accumulated > THRESHOLD) {
        accumulated = 0;
        setFocusedIndex((i) => Math.min(books.length - 1, i + 1));
      } else if (accumulated < -THRESHOLD) {
        accumulated = 0;
        setFocusedIndex((i) => Math.max(0, i - 1));
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [books.length]);

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
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goUp();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goDown();
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
      status: book.status,
      rating: book.rating,
      book_type: book.book_type,
      page_count: book.page_count,
      is_favorite: book.is_favorite,
      summary: book.summary,
    };
    setBooks((prev) => [...prev, tempBook]);

    try {
      const result = await addShelfItem(shelf.id, book.id);
      if (result === null) {
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
  const prevBook = books[focusedIndex - 1] ?? null;
  const nextBook = books[focusedIndex + 1] ?? null;

  // Group vibes by relevant categories for the focused book's type
  const bookType = focusedBook?.book_type ?? "fiction";
  const relevantCategories = TAG_CATEGORIES[bookType] ?? TAG_CATEGORIES.fiction;
  const groupedVibes = relevantCategories
    .map((cat) => ({
      label: TAG_CATEGORY_LABELS[cat] ?? cat,
      tags: vibes.filter((v) => v.tag_category === cat).map((v) => v.vibe),
    }))
    .filter((g) => g.tags.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#1a1210" }}>
      {/* Header */}
      <header className="relative z-30 flex items-center justify-between px-6 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-serif text-xl italic tracking-wide text-white/90 sm:text-2xl">
            {shelf.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-white/30 sm:block">
            Scroll or use arrow keys
          </span>
          <button
            onClick={() => setShowSettings((o) => !o)}
            className={`rounded-full p-2 transition-colors ${
              showSettings
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Save error */}
      {saveError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {saveError}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="relative z-30 space-y-3 border-b border-white/10 px-6 py-4 md:px-8" style={{ backgroundColor: "rgba(33, 20, 17, 0.9)" }}>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                className="border-white/20 bg-white/5 text-sm text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") { setEditingName(false); setNameDraft(shelf.name); }
                }}
              />
              <button onClick={handleSaveName} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90">Save</button>
              <button onClick={() => { setEditingName(false); setNameDraft(shelf.name); }} className="shrink-0 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setNameDraft(shelf.name); setEditingName(true); }} className="rounded-md px-1 py-0.5 text-sm font-medium text-white/90 hover:bg-white/10">
              {shelf.name}<span className="ml-2 text-xs text-white/40">(click to edit)</span>
            </button>
          )}

          {editingDesc ? (
            <div className="space-y-2">
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
                rows={2}
                className="border-white/20 bg-white/5 text-sm text-white"
                onKeyDown={(e) => { if (e.key === "Escape") { setEditingDesc(false); setDescDraft(shelf.description ?? ""); } }}
              />
              <div className="flex gap-2">
                <button onClick={handleSaveDesc} className="rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90">Save</button>
                <button onClick={() => { setEditingDesc(false); setDescDraft(shelf.description ?? ""); }} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setDescDraft(shelf.description ?? ""); setEditingDesc(true); }} className="rounded-md px-1 py-0.5 text-sm text-white/50 hover:bg-white/10">
              {shelf.description || "Add description..."}
            </button>
          )}

          {shelf.shelf_type === "auto" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-white/50">Filter Rules</p>
              <ShelfFilterBuilder filter={filterDraft} onChange={setFilterDraft} />
              <button onClick={handleSaveFilter} className="rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90">Apply Filter</button>
            </div>
          )}

          {shelf.shelf_type === "manual" && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSearch(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">
                <Plus className="h-3 w-3" />Add Book
              </button>
              {focusedBook && (
                <button onClick={handleRemoveFocused} className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
                  <X className="h-3 w-3" />Remove &ldquo;{focusedBook.title}&rdquo;
                </button>
              )}
            </div>
          )}

          <button onClick={handleDeleteShelf} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
            <Trash2 className="h-3 w-3" />Delete Shelf
          </button>
        </div>
      )}

      {/* Main stage */}
      <main ref={stageRef} className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        {loading ? (
          <p className="text-white/50">Loading...</p>
        ) : books.length === 0 ? (
          <div className="space-y-3 text-center">
            <p className="text-white/50">This shelf is empty.</p>
            {shelf.shelf_type === "manual" ? (
              <button onClick={() => { setShowSettings(true); setShowSearch(true); }} className="text-sm text-primary hover:underline">Add books</button>
            ) : (
              <button onClick={() => setShowSettings(true)} className="text-sm text-primary hover:underline">Adjust filter</button>
            )}
          </div>
        ) : (
          <>
            {/* Previous book (peeking from top) */}
            {prevBook && (
              <button
                onClick={goUp}
                className="absolute top-[5%] z-0 select-none opacity-35 blur-[2px] transition-all duration-500 md:top-[8%]"
                style={{ transform: "scale(0.85) translateY(12px)" }}
              >
                <BookCoverImage book={prevBook} className="h-56 w-36 rounded-lg shadow-2xl md:h-72 md:w-48" />
                <div className="absolute inset-0 rounded-lg bg-black/40" />
              </button>
            )}

            {/* Focused book (center stage) */}
            <div className="relative z-20 flex flex-col items-center">
              <div
                className="relative cursor-pointer transition-all duration-500 hover:scale-[1.02]"
                onClick={() => focusedBook && navigate(`/books/${focusedBook.id}`)}
              >
                {focusedBook?.status && (
                  <div className="absolute -top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-primary px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                    {STATUS_LABELS[focusedBook.status] ?? focusedBook.status}
                  </div>
                )}
                <BookCoverImage
                  book={focusedBook!}
                  className="h-80 w-52 rounded-xl border border-white/5 shadow-2xl sm:h-96 sm:w-64 md:h-[28rem] md:w-72 lg:h-[32rem] lg:w-80"
                  style={{ boxShadow: "0 0 60px -15px rgba(232, 79, 48, 0.15)" }}
                />
              </div>

              <div className="mt-7 max-w-md space-y-2 text-center">
                <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl md:text-5xl">
                  {focusedBook?.title}
                </h2>
                <p className="font-serif text-lg italic text-white/60 sm:text-xl">
                  by {focusedBook?.author}
                </p>
                <div className="flex items-center justify-center gap-4 pt-2 text-xs font-medium uppercase tracking-widest text-white/40 sm:gap-6">
                  {focusedBook?.rating != null && focusedBook.rating > 0 && (
                    <>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        {focusedBook.rating}
                      </span>
                      <span className="text-white/20">&middot;</span>
                    </>
                  )}
                  {focusedBook?.page_count && (
                    <>
                      <span>{focusedBook.page_count} Pages</span>
                      <span className="text-white/20">&middot;</span>
                    </>
                  )}
                  <span>{focusedBook?.book_type ?? "Fiction"}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => focusedBook && navigate(`/books/${focusedBook.id}`)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-primary/90 hover:shadow-primary/20"
                >
                  <BookOpen className="h-4 w-4" />
                  View Book
                </button>
                {focusedBook?.is_favorite && (
                  <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                    <Heart className="h-4 w-4 fill-primary text-primary" />
                  </div>
                )}
              </div>
            </div>

            {/* Next book (peeking from bottom) */}
            {nextBook && (
              <button
                onClick={goDown}
                className="absolute bottom-[5%] z-0 select-none opacity-35 blur-[2px] transition-all duration-500 md:bottom-[8%]"
                style={{ transform: "scale(0.85) translateY(-12px)" }}
              >
                <BookCoverImage book={nextBook} className="h-56 w-36 rounded-lg shadow-2xl md:h-72 md:w-48" />
                <div className="absolute inset-0 rounded-lg bg-black/40" />
              </button>
            )}

            {/* Navigation chevrons */}
            <button
              onClick={goUp}
              disabled={focusedIndex === 0}
              className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-white/5 bg-white/5 p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:invisible"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              onClick={goDown}
              disabled={focusedIndex === books.length - 1}
              className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/5 bg-white/5 p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:invisible"
            >
              <ChevronDown className="h-5 w-5" />
            </button>

            {/* Right side panel — Summary + Tags (xl screens only) */}
            {focusedBook && (focusedBook.summary || groupedVibes.length > 0) && (
              <aside className="pointer-events-none fixed right-8 top-1/2 z-20 hidden w-72 -translate-y-1/2 flex-col gap-5 xl:flex">
                {/* Summary card */}
                {focusedBook.summary && (
                  <div
                    className="pointer-events-auto rounded-xl border border-white/5 p-5 transition-transform duration-300 hover:-translate-y-1"
                    style={{ backgroundColor: "rgba(33, 20, 17, 0.7)", backdropFilter: "blur(12px)" }}
                  >
                    <h3 className="mb-3 font-serif text-base italic text-white">Summary</h3>
                    <p className="text-sm leading-relaxed text-white/55">
                      {truncateWords(focusedBook.summary, 40)}
                    </p>
                  </div>
                )}

                {/* Tags card */}
                {groupedVibes.length > 0 && (
                  <div
                    className="pointer-events-auto rounded-xl border border-white/5 p-5 transition-transform duration-300 hover:-translate-y-1"
                    style={{ backgroundColor: "rgba(33, 20, 17, 0.7)", backdropFilter: "blur(12px)" }}
                  >
                    <h3 className="mb-3 font-serif text-base italic text-white">
                      {bookType === "fiction" ? "Vibes" : bookType === "poetry" ? "Poetry Profile" : "Classification"}
                    </h3>
                    <div className="space-y-3">
                      {groupedVibes.map((group) => (
                        <div key={group.label}>
                          {groupedVibes.length > 1 && (
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                              {group.label}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {group.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded border border-white/5 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-white/50"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </>
        )}
      </main>

      {/* Footer pagination */}
      {books.length > 0 && (
        <footer className="relative z-10 flex justify-center pb-6">
          <div
            className="flex items-center gap-3 rounded-full border border-white/5 px-5 py-2"
            style={{ backgroundColor: "rgba(33, 20, 17, 0.7)", backdropFilter: "blur(12px)" }}
          >
            <span className="font-serif text-sm italic text-white/50">Book</span>
            <span className="text-lg font-bold text-primary">
              {String(focusedIndex + 1).padStart(2, "0")}
            </span>
            <span className="h-px w-6 bg-white/20" />
            <span className="text-sm font-bold text-white/80">
              {String(books.length).padStart(2, "0")}
            </span>
          </div>
        </footer>
      )}

      {/* Book search modal */}
      {showSearch && (
        <BookSearchModal
          onSelect={handleAddBook}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

function BookCoverImage({
  book,
  className = "",
  style,
}: {
  book: ShelfBook;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (book.cover_image_url) {
    return (
      <img
        src={book.cover_image_url}
        alt={book.title}
        className={`object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-[#2a1d1a] px-4 text-center ${className}`}
      style={style}
    >
      <div>
        <p className="font-serif text-sm font-bold leading-tight text-white/80 line-clamp-3">
          {book.title}
        </p>
        <p className="mt-1 text-xs text-white/50 line-clamp-1">{book.author}</p>
      </div>
    </div>
  );
}
