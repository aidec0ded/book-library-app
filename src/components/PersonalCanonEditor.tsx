import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { BookSearchModal } from "@/components/BookSearchModal";
import type { Book } from "@/lib/types";

interface PersonalCanonEditorProps {
  books: Book[];
  onUpdate: (bookIds: string[]) => Promise<void>;
}

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

  if (books.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No books in your personal canon yet. Add books that define you as a
          reader.
        </p>
        <button
          onClick={() => setShowSearch(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Book
        </button>
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {books.map((book) => (
          <div key={book.id} className="group relative">
            <Link
              to={`/books/${book.id}`}
              className="block rounded-lg border p-2 transition-colors hover:bg-muted/50"
            >
              {book.cover_image_url ? (
                <img
                  src={book.cover_image_url}
                  alt={book.title}
                  className="mx-auto h-32 w-auto rounded object-cover"
                />
              ) : (
                <div className="flex h-32 items-center justify-center rounded bg-muted px-2 text-center text-xs text-muted-foreground">
                  {book.title}
                </div>
              )}
              <div className="mt-1.5 truncate text-xs font-medium">
                {book.title}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {book.author}
              </div>
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
      </div>

      <button
        onClick={() => setShowSearch(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Book
      </button>

      {showSearch && (
        <BookSearchModal
          onSelect={handleAdd}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
