import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { EditionPicker } from "@/components/EditionPicker";
import {
  baseTitle,
  findWorkEditions,
  searchBooks,
  type ISBNdbBook,
} from "@/lib/isbndb";
import type { Book } from "@/lib/types";

interface ChangeEditionModalProps {
  book: Book;
  onSelect: (edition: ISBNdbBook) => void;
  onClose: () => void;
}

export function ChangeEditionModal({ book, onSelect, onClose }: ChangeEditionModalProps) {
  const [editions, setEditions] = useState<ISBNdbBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchBooks(baseTitle(book.title), 1, 100, "title")
      .then(({ books }) => {
        if (!cancelled) setEditions(findWorkEditions(books, book.title, book.author));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load editions. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [book.title, book.author]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Change edition of ${book.title}`}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-lg sm:max-h-[75vh]"
      >
        <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Change edition</h2>
            <p className="truncate text-sm text-muted-foreground">
              {book.title} · {book.author}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!error && !editions && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding editions...
            </div>
          )}

          {editions && editions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No editions found for this book. You can enter its details yourself with
              &ldquo;Edit details&rdquo;.
            </p>
          )}

          {editions && editions.length > 0 && (
            <EditionPicker
              editions={editions}
              currentIsbn={book.isbn}
              notListedHint="Not listed? Close this and use “Edit details” to enter your edition yourself."
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
