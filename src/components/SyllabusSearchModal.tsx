import { useState, useEffect, useRef } from "react";
import { X, Library as LibraryIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { searchBooks, groupEditions, type ISBNdbBook } from "@/lib/isbndb";
import type { Book } from "@/lib/types";

function ModalCoverThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="h-10 w-7 rounded object-cover"
        onError={() => setBroken(true)}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth === 0) setBroken(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-10 w-7 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
      ?
    </div>
  );
}

export interface ExternalBook {
  title: string;
  author: string;
  coverUrl: string | null;
  isbn: string | null;
}

interface SyllabusSearchModalProps {
  onSelectLibraryBook: (book: Book) => void;
  onSelectExternalBook: (book: ExternalBook) => void;
  onClose: () => void;
}

export function SyllabusSearchModal({
  onSelectLibraryBook,
  onSelectExternalBook,
  onClose,
}: SyllabusSearchModalProps) {
  const [query, setQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<Book[]>([]);
  const [externalResults, setExternalResults] = useState<{ title: string; author: string; coverUrl: string | null; isbn: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [isbndbFailed, setIsbndbFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setLibraryResults([]);
      setExternalResults([]);
      setIsbndbFailed(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setIsbndbFailed(false);

      const pattern = `%${q}%`;

      // Run library + ISBNdb searches in parallel
      const libraryPromise = supabase
        .from("books")
        .select("*")
        .or(`title.ilike.${pattern},author.ilike.${pattern}`)
        .order("title")
        .limit(5)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as Book[];
        })
        .catch(() => [] as Book[]);

      const isbndbPromise = searchBooks(q, 1, 10)
        .then(({ books }) => {
          const groups = groupEditions(books, q);
          return groups.slice(0, 5).map((g) => ({
            title: g.best.title,
            author: g.best.authors?.[0] ?? "Unknown",
            coverUrl: g.best.image ?? null,
            isbn: g.best.isbn13 ?? g.best.isbn ?? null,
          }));
        })
        .catch(() => {
          setIsbndbFailed(true);
          return [] as { title: string; author: string; coverUrl: string | null; isbn: string | null }[];
        });

      const [library, external] = await Promise.all([libraryPromise, isbndbPromise]);

      // Filter external results to exclude books already in library results (by ISBN)
      const libraryIsbns = new Set(library.map((b) => b.isbn).filter(Boolean));
      const filtered = external.filter((e) => !e.isbn || !libraryIsbns.has(e.isbn));

      setLibraryResults(library);
      setExternalResults(filtered);
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const hasResults = libraryResults.length > 0 || externalResults.length > 0;
  const showNoResults = !searching && !hasResults && query.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-lg">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library or ISBNdb..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {searching && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {showNoResults && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No results found.
            </div>
          )}

          {libraryResults.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From Your Library
              </div>
              {libraryResults.map((book) => (
                <button
                  key={book.id}
                  onClick={() => onSelectLibraryBook(book)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                >
                  <ModalCoverThumb url={book.cover_image_url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{book.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {book.author}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    <LibraryIcon className="h-3 w-3" />
                    In Library
                  </span>
                </button>
              ))}
            </div>
          )}

          {externalResults.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From ISBNdb
              </div>
              {externalResults.map((book, i) => (
                <button
                  key={`ext-${i}`}
                  onClick={() => onSelectExternalBook(book)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                >
                  <ModalCoverThumb url={book.coverUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{book.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {book.author}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-amber-600">
                    Not in library
                  </span>
                </button>
              ))}
            </div>
          )}

          {isbndbFailed && libraryResults.length > 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground italic">
              ISBNdb search unavailable — showing library results only.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
