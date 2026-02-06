import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookRow } from "@/components/BookRow";
import { ReadingQuote } from "@/components/ReadingQuote";
import { ShelvesView } from "@/components/ShelvesView";
import {
  fetchBookIdsByCanonicalVibes,
  fetchCanonicalVibesForBooks,
} from "@/lib/vibes";
import { fetchDistinctGenres } from "@/lib/filters";
import {
  CANONICAL_VIBES,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import { MONTH_NAMES } from "@/lib/timing";
import type { BookSummary } from "@/lib/types";

const PAGE_SIZE = 20;

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "5", label: "5 stars" },
  { value: "4.5", label: "4.5+" },
  { value: "4", label: "4+" },
  { value: "3", label: "3+" },
  { value: "unrated", label: "Unrated" },
];

function parseVibesParam(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasActiveFilters(params: {
  status: string;
  rating: string;
  genre: string;
  month: string;
  vibes: string[];
  showAll: boolean;
  pageCountMin: string;
  pageCountMax: string;
  pubYearMin: string;
  pubYearMax: string;
}): boolean {
  return (
    params.status !== "any" ||
    params.rating !== "any" ||
    params.genre !== "any" ||
    params.month !== "any" ||
    params.vibes.length > 0 ||
    params.showAll ||
    params.pageCountMin !== "" ||
    params.pageCountMax !== "" ||
    params.pubYearMin !== "" ||
    params.pubYearMax !== ""
  );
}

function buildFilterSummary(params: {
  status: string;
  rating: string;
  genre: string;
  month: string;
  vibes: string[];
  showAll: boolean;
  pageCountMin: string;
  pageCountMax: string;
  pubYearMin: string;
  pubYearMax: string;
}): string {
  const parts: string[] = [];
  if (params.status !== "any") parts.push(params.status);
  if (params.rating === "unrated") parts.push("unrated");
  else if (params.rating !== "any") parts.push(`${params.rating}+ stars`);
  if (params.genre !== "any") parts.push(params.genre);
  if (params.month !== "any") {
    const idx = Number(params.month) - 1;
    parts.push(MONTH_NAMES[idx]);
  }
  if (params.pageCountMin && params.pageCountMax)
    parts.push(`${params.pageCountMin}–${params.pageCountMax} pages`);
  else if (params.pageCountMin) parts.push(`>${params.pageCountMin} pages`);
  else if (params.pageCountMax) parts.push(`<${params.pageCountMax} pages`);
  if (params.pubYearMin && params.pubYearMax)
    parts.push(`${params.pubYearMin}–${params.pubYearMax}`);
  else if (params.pubYearMin) parts.push(`>${params.pubYearMin}`);
  else if (params.pubYearMax) parts.push(`<${params.pubYearMax}`);
  if (params.vibes.length > 0)
    parts.push(params.vibes.map(formatCanonicalVibe).join(", "));
  if (params.showAll) parts.push("all books");
  return parts.join(" · ");
}

export function BookList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL
  const initialQuery = searchParams.get("q") ?? "";
  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialStatus = searchParams.get("status") ?? "any";
  const initialRating = searchParams.get("rating") ?? "any";
  const initialGenre = searchParams.get("genre") ?? "any";
  const initialMonth = searchParams.get("month") ?? "any";
  const initialVibes = parseVibesParam(searchParams.get("vibes"));
  const initialShowAll = searchParams.get("all") === "1";
  const initialPcMin = searchParams.get("pcMin") ?? "";
  const initialPcMax = searchParams.get("pcMax") ?? "";
  const initialPyMin = searchParams.get("pyMin") ?? "";
  const initialPyMax = searchParams.get("pyMax") ?? "";
  const view = searchParams.get("view") === "shelves" ? "shelves" : "list";

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [status, setStatus] = useState(initialStatus);
  const [rating, setRating] = useState(initialRating);
  const [genre, setGenre] = useState(initialGenre);
  const [month, setMonth] = useState(initialMonth);
  const [selectedVibes, setSelectedVibes] = useState<string[]>(initialVibes);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [pageCountMin, setPageCountMin] = useState(initialPcMin);
  const [pageCountMax, setPageCountMax] = useState(initialPcMax);
  const [pubYearMin, setPubYearMin] = useState(initialPyMin);
  const [pubYearMax, setPubYearMax] = useState(initialPyMax);
  // Local input state for range filters (committed on blur/Enter)
  const [pcMinInput, setPcMinInput] = useState(initialPcMin);
  const [pcMaxInput, setPcMaxInput] = useState(initialPcMax);
  const [pyMinInput, setPyMinInput] = useState(initialPyMin);
  const [pyMaxInput, setPyMaxInput] = useState(initialPyMax);
  const [filtersOpen, setFiltersOpen] = useState(
    hasActiveFilters({
      status: initialStatus,
      rating: initialRating,
      genre: initialGenre,
      month: initialMonth,
      vibes: initialVibes,
      showAll: initialShowAll,
      pageCountMin: initialPcMin,
      pageCountMax: initialPcMax,
      pubYearMin: initialPyMin,
      pubYearMax: initialPyMax,
    }),
  );

  // Genre options (fetched once)
  const [genres, setGenres] = useState<string[]>([]);
  useEffect(() => {
    void fetchDistinctGenres().then(setGenres);
  }, []);

  // Vibe badge map for current page
  const [vibeMap, setVibeMap] = useState<Map<string, string[]>>(new Map());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset page when debounced query actually changes (not on mount).
  // Uses a ref comparison instead of a mount guard so it works correctly
  // with React 18 StrictMode double-mounting.
  const prevDebouncedQuery = useRef(debouncedQuery);
  useEffect(() => {
    if (prevDebouncedQuery.current !== debouncedQuery) {
      prevDebouncedQuery.current = debouncedQuery;
      setPage(1);
    }
  }, [debouncedQuery]);

  // Filter changes reset page via their event handlers below (not effects),
  // so navigating back preserves the page from the URL.

  // Sync state to URL params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (page > 1) params.page = String(page);
    if (status !== "any") params.status = status;
    if (rating !== "any") params.rating = rating;
    if (genre !== "any") params.genre = genre;
    if (month !== "any") params.month = month;
    if (selectedVibes.length > 0) params.vibes = selectedVibes.join(",");
    if (showAll) params.all = "1";
    if (pageCountMin) params.pcMin = pageCountMin;
    if (pageCountMax) params.pcMax = pageCountMax;
    if (pubYearMin) params.pyMin = pubYearMin;
    if (pubYearMax) params.pyMax = pubYearMax;
    if (view === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }, [
    debouncedQuery,
    page,
    status,
    rating,
    genre,
    month,
    selectedVibes,
    showAll,
    pageCountMin,
    pageCountMax,
    pubYearMin,
    pubYearMax,
    view,
    setSearchParams,
  ]);

  // Fetch books
  const fetchBooks = useCallback(async () => {
    setLoading(true);

    // If vibes are selected, first get matching book IDs
    let vibeBookIds: string[] | null = null;
    if (selectedVibes.length > 0) {
      vibeBookIds = await fetchBookIdsByCanonicalVibes(selectedVibes);
      if (vibeBookIds.length === 0) {
        setBooks([]);
        setCount(0);
        setVibeMap(new Map());
        setLoading(false);
        return;
      }
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("books")
      .select("id, title, author, status, rating, timing_raw, cover_image_url", {
        count: "exact",
      })
      .order("title", { ascending: true })
      .range(from, to);

    // Apply filters
    if (status !== "any") {
      q = q.eq("status", status);
    }

    if (rating !== "any") {
      if (rating === "unrated") {
        q = q.is("rating", null);
      } else {
        q = q.gte("rating", Number(rating));
      }
    }

    if (genre !== "any") {
      q = q.eq("genre", genre);
    }

    if (month !== "any") {
      q = q.eq("timing_month", Number(month));
    }

    if (pageCountMin) {
      q = q.not("page_count", "is", null).gte("page_count", Number(pageCountMin));
    }
    if (pageCountMax) {
      q = q.not("page_count", "is", null).lte("page_count", Number(pageCountMax));
    }
    if (pubYearMin) {
      q = q.not("publication_year", "is", null).gte("publication_year", Number(pubYearMin));
    }
    if (pubYearMax) {
      q = q.not("publication_year", "is", null).lte("publication_year", Number(pubYearMax));
    }

    if (!showAll) {
      q = q.or("timing_raw.not.is.null,status.eq.wishlist,status.eq.reading");
    }

    if (debouncedQuery) {
      const pattern = `%${debouncedQuery}%`;
      q = q.or(`title.ilike.${pattern},author.ilike.${pattern}`);
    }

    if (vibeBookIds) {
      q = q.in("id", vibeBookIds);
    }

    const { data, count: totalCount, error } = await q;

    if (error) {
      console.error("Error fetching books:", error);
      setLoading(false);
      return;
    }

    const results = data ?? [];
    setBooks(results);
    setCount(totalCount ?? 0);

    // Batch-fetch canonical vibes for this page
    if (results.length > 0) {
      const ids = results.map((b) => b.id);
      const map = await fetchCanonicalVibesForBooks(ids);
      setVibeMap(map);
    } else {
      setVibeMap(new Map());
    }

    setLoading(false);
  }, [
    debouncedQuery,
    page,
    status,
    rating,
    genre,
    month,
    selectedVibes,
    showAll,
    pageCountMin,
    pageCountMax,
    pubYearMin,
    pubYearMax,
  ]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  function toggleVibe(tag: string) {
    setSelectedVibes((prev) =>
      prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag],
    );
    setPage(1);
  }

  function clearFilters() {
    setStatus("any");
    setRating("any");
    setGenre("any");
    setMonth("any");
    setSelectedVibes([]);
    setShowAll(false);
    setPageCountMin("");
    setPageCountMax("");
    setPubYearMin("");
    setPubYearMax("");
    setPcMinInput("");
    setPcMaxInput("");
    setPyMinInput("");
    setPyMaxInput("");
    setPage(1);
  }

  const filterState = {
    status,
    rating,
    genre,
    month,
    vibes: selectedVibes,
    showAll,
    pageCountMin,
    pageCountMax,
    pubYearMin,
    pubYearMax,
  };
  const active = hasActiveFilters(filterState);
  const summary = buildFilterSummary(filterState);

  function setView(v: "list" | "shelves") {
    const params: Record<string, string> = {};
    if (v === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-6">
      <ReadingQuote />

      {/* View toggle */}
      <div className="flex items-center justify-end">
        <div className="flex rounded-md border">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("shelves")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              view === "shelves"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Shelves
          </button>
        </div>
      </div>

      {view === "shelves" ? (
        <ShelvesView />
      ) : (
      <div className="space-y-4">
        <Input
          type="search"
          placeholder="Search by title or author..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Filter toggle */}
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Filters
          {active && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
              {[
                status !== "any",
                rating !== "any",
                genre !== "any",
                month !== "any",
                selectedVibes.length > 0,
                showAll,
                pageCountMin !== "" || pageCountMax !== "",
                pubYearMin !== "" || pubYearMax !== "",
              ].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Filter bar */}
        {filtersOpen && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-3">
              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Status
                </label>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="reading">Reading</SelectItem>
                    <SelectItem value="unfinished">Unfinished</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Rating */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Rating
                </label>
                <Select value={rating} onValueChange={(v) => { setRating(v); setPage(1); }}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Genre */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Genre
                </label>
                <Select value={genre} onValueChange={(v) => { setGenre(v); setPage(1); }}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {genres.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Month
                </label>
                <Select value={month} onValueChange={(v) => { setMonth(v); setPage(1); }}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Range filters */}
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Pages
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    placeholder="Min"
                    className="h-8 w-20"
                    value={pcMinInput}
                    onChange={(e) => setPcMinInput(e.target.value)}
                    onBlur={() => { setPageCountMin(pcMinInput); setPage(1); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPageCountMin(pcMinInput); setPage(1); } }}
                  />
                  <span className="text-xs text-muted-foreground">&ndash;</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    className="h-8 w-20"
                    value={pcMaxInput}
                    onChange={(e) => setPcMaxInput(e.target.value)}
                    onBlur={() => { setPageCountMax(pcMaxInput); setPage(1); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPageCountMax(pcMaxInput); setPage(1); } }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Year
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    placeholder="Min"
                    className="h-8 w-20"
                    value={pyMinInput}
                    onChange={(e) => setPyMinInput(e.target.value)}
                    onBlur={() => { setPubYearMin(pyMinInput); setPage(1); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPubYearMin(pyMinInput); setPage(1); } }}
                  />
                  <span className="text-xs text-muted-foreground">&ndash;</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    className="h-8 w-20"
                    value={pyMaxInput}
                    onChange={(e) => setPyMaxInput(e.target.value)}
                    onBlur={() => { setPubYearMax(pyMaxInput); setPage(1); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPubYearMax(pyMaxInput); setPage(1); } }}
                  />
                </div>
              </div>
            </div>

            {/* Has timing toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => { setShowAll(e.target.checked); setPage(1); }}
                className="rounded"
              />
              <span className="text-muted-foreground">
                Show books without seasonal timing
              </span>
            </label>

            {/* Canonical vibes multi-select */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Vibes
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CANONICAL_VIBES.map((cv) => {
                  const isActive = selectedVibes.includes(cv.tag);
                  return (
                    <Badge
                      key={cv.tag}
                      variant={isActive ? "default" : "outline"}
                      className={`cursor-pointer transition-opacity ${
                        isActive ? "" : "opacity-60 hover:opacity-90"
                      }`}
                      title={cv.description}
                      onClick={() => toggleVibe(cv.tag)}
                    >
                      {formatCanonicalVibe(cv.tag)}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Clear */}
            {active && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Result count + filter summary */}
        <div className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : `${count} book${count !== 1 ? "s" : ""}${summary ? ` — ${summary}` : ""}`}
        </div>

        {books.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {books.map((book) => (
              <BookRow
                key={book.id}
                book={book}
                vibes={vibeMap.get(book.id)}
              />
            ))}
          </div>
        ) : (
          !loading && (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No books found.
            </div>
          )
        )}

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
      )}
    </div>
  );
}
