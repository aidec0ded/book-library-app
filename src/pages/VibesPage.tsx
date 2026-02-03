import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  fetchCanonicalVibesWithCounts,
  fetchBooksByCanonicalVibe,
} from "@/lib/vibes";
import {
  CANONICAL_VIBES,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import { BookRow } from "@/components/BookRow";
import type { BookSummary } from "@/lib/types";

const PAGE_SIZE = 20;

// Build a lookup from tag -> description
const VIBE_DESCRIPTIONS = new Map(
  CANONICAL_VIBES.map((v) => [v.tag, v.description]),
);

export function VibesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedVibe = searchParams.get("vibe");
  const page = Number(searchParams.get("page") ?? "1");

  // Grid view state
  const [vibeCounts, setVibeCounts] = useState<
    Map<string, number>
  >(new Map());
  const [gridLoading, setGridLoading] = useState(true);

  // List view state
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [bookCount, setBookCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  // Fetch vibe counts for grid
  useEffect(() => {
    void fetchCanonicalVibesWithCounts().then((rows) => {
      const map = new Map(rows.map((r) => [r.vibe, r.count]));
      setVibeCounts(map);
      setGridLoading(false);
    });
  }, []);

  // Fetch books for selected vibe
  const fetchBooks = useCallback(async () => {
    if (!selectedVibe) return;
    setListLoading(true);
    try {
      const result = await fetchBooksByCanonicalVibe(
        selectedVibe,
        page,
        PAGE_SIZE,
      );
      setBooks(result.books);
      setBookCount(result.count);
    } catch (err) {
      console.error("Error fetching books by vibe:", err);
    }
    setListLoading(false);
  }, [selectedVibe, page]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(bookCount / PAGE_SIZE);

  function handleVibeClick(tag: string) {
    setSearchParams({ vibe: tag, page: "1" });
  }

  function handlePageChange(newPage: number) {
    if (!selectedVibe) return;
    setSearchParams({ vibe: selectedVibe, page: String(newPage) });
  }

  // List view — books for a selected vibe
  if (selectedVibe) {
    const description = VIBE_DESCRIPTIONS.get(selectedVibe);

    return (
      <div className="space-y-4">
        <div>
          <Link
            to="/vibes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; All vibes
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {formatCanonicalVibe(selectedVibe)}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {listLoading
            ? "Loading..."
            : `${bookCount} book${bookCount !== 1 ? "s" : ""}`}
        </div>

        <div className="divide-y rounded-lg border">
          {books.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
          {!listLoading && books.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              No books found with this vibe.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() =>
                handlePageChange(Math.min(totalPages, page + 1))
              }
              disabled={page >= totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  // Grid view — all 17 canonical vibes
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Vibes</h1>
        <p className="text-sm text-muted-foreground">
          Browse books by mood and reading experience
        </p>
      </div>

      {gridLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CANONICAL_VIBES.map((cv) => {
            const count = vibeCounts.get(cv.tag) ?? 0;
            return (
              <button
                key={cv.tag}
                onClick={() => handleVibeClick(cv.tag)}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="font-medium">
                  {formatCanonicalVibe(cv.tag)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {cv.description}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {count} book{count !== 1 ? "s" : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
