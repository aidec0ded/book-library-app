import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getCurrentTiming, MONTH_NAMES, formatTiming } from "@/lib/timing";
import { BookRow } from "@/components/BookRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookSummary } from "@/lib/types";

const PAGE_SIZE = 20;

const POSITIONS = [
  { value: "any", label: "Any position" },
  { value: "early", label: "Early" },
  { value: "mid", label: "Mid" },
  { value: "late", label: "Late" },
] as const;

export function SeasonalBooks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTiming = getCurrentTiming();

  const initialMonth = Number(
    searchParams.get("month") ?? String(currentTiming.month),
  );
  const initialPosition =
    searchParams.get("position") ?? currentTiming.position;
  const initialPage = Number(searchParams.get("page") ?? "1");

  const [month, setMonth] = useState(initialMonth);
  const [position, setPosition] = useState(initialPosition);
  const [page, setPage] = useState(initialPage);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Sync state to URL params
  useEffect(() => {
    const params: Record<string, string> = { month: String(month) };
    if (position !== "any") params.position = position;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [month, position, page, setSearchParams]);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let queryBuilder = supabase
      .from("books")
      .select("id, title, author, status, rating, timing_raw", {
        count: "exact",
      })
      .eq("timing_month", month)
      .order("title", { ascending: true })
      .range(from, to);

    if (position !== "any") {
      queryBuilder = queryBuilder.or(
        `timing_position.eq.${position},timing_position.is.null`,
      );
    }

    const { data, count: totalCount, error } = await queryBuilder;

    if (error) {
      console.error("Error fetching seasonal books:", error);
    } else {
      setBooks(data ?? []);
      setCount(totalCount ?? 0);
    }
    setLoading(false);
  }, [month, position, page]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  function handleMonthChange(value: string) {
    setMonth(Number(value));
    setPage(1);
  }

  function handlePositionChange(value: string) {
    setPosition(value);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Seasonal Books</h1>
        <p className="text-sm text-muted-foreground">
          Browse books by when to read them
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(month)} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={position} onValueChange={handlePositionChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">
        {loading
          ? "Loading..."
          : `${count} book${count !== 1 ? "s" : ""} for ${position === "any" ? formatTiming(month) : formatTiming(month, position).toLowerCase()}`}
      </div>

      <div className="divide-y rounded-lg border">
        {books.map((book) => (
          <BookRow key={book.id} book={book} />
        ))}
        {!loading && books.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No books found for this time period.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
