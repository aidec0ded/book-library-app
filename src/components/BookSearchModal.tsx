import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Book } from "@/lib/types";

interface BookSearchModalProps {
  onSelect: (book: Book) => void;
  onClose: () => void;
}

export function BookSearchModal({ onSelect, onClose }: BookSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const pattern = `%${q}%`;
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .or(`title.ilike.${pattern},author.ilike.${pattern}`)
          .order("title")
          .limit(10);

        if (error) throw error;
        setResults(data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

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
            placeholder="Search your library..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {searching && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {!searching && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No books found.
            </div>
          )}

          {results.map((book) => (
            <button
              key={book.id}
              onClick={() => onSelect(book)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
            >
              {book.cover_image_url ? (
                <img
                  src={book.cover_image_url}
                  alt=""
                  className="h-10 w-7 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-7 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  ?
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{book.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {book.author}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
