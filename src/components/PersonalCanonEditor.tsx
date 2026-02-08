import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { BookSearchModal } from "@/components/BookSearchModal";
import type { Book } from "@/lib/types";

interface PersonalCanonEditorProps {
  books: Book[];
  onUpdate: (bookIds: string[]) => Promise<void>;
}

const COVER_W = 180;

export function PersonalCanonEditor({
  books,
  onUpdate,
}: PersonalCanonEditorProps) {
  const [showSearch, setShowSearch] = useState(false);

  async function handleAdd(book: Book) {
    setShowSearch(false);
    if (books.some((b) => b.id === book.id)) return;
    const newIds = [...books.map((b) => b.id), book.id];
    await onUpdate(newIds);
  }

  async function handleRemove(bookId: string) {
    const newIds = books.filter((b) => b.id !== bookId).map((b) => b.id);
    await onUpdate(newIds);
  }

  const addButton = (
    <button
      onClick={() => setShowSearch(true)}
      className="flex-shrink-0"
      style={{ width: COVER_W }}
    >
      <div className="group flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded border-2 border-dashed border-border transition-all hover:border-accent/50 hover:bg-accent/5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-accent group-hover:text-white">
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-accent">
          Add to Canon
        </span>
      </div>
    </button>
  );

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">
          No books in your personal canon yet.
        </p>
        {addButton}
        {showSearch && (
          <BookSearchModal
            onSelect={handleAdd}
            onClose={() => setShowSearch(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hidden">
        {books.map((book) => (
          <div
            key={book.id}
            className="group relative flex-shrink-0"
            style={{ width: COVER_W }}
          >
            <Link to={`/books/${book.id}`} className="block">
              {book.cover_image_url ? (
                <div className="relative overflow-hidden rounded shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <img
                    src={book.cover_image_url}
                    alt={book.title}
                    className="aspect-[2/3] w-full object-cover"
                  />
                  {/* Spine effect */}
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-1"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(0,0,0,0.12), rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.06))",
                    }}
                  />
                </div>
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded bg-secondary px-3 text-center shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div>
                    <p className="font-serif text-sm font-bold leading-tight line-clamp-3">
                      {book.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {book.author}
                    </p>
                  </div>
                </div>
              )}
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                void handleRemove(book.id);
              }}
              className="absolute -right-1.5 -top-1.5 hidden rounded-full border bg-background p-0.5 shadow-sm hover:bg-destructive hover:text-destructive-foreground group-hover:block"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {addButton}
      </div>

      {showSearch && (
        <BookSearchModal
          onSelect={handleAdd}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
