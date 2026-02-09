import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Pagination } from "@/components/Pagination";
import { Input } from "@/components/ui/input";
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
import { TagPillBar } from "@/components/TagPillBar";
import { BookCoverCard } from "@/components/BookCoverCard";
import { fetchCanonicalVibesForBooks } from "@/lib/vibes";
import { fetchDistinctGenres } from "@/lib/filters";
import { fetchCanonicalTags } from "@/lib/canonical-vibes";
import { fetchGalleryBooks, GALLERY_PAGE_SIZE } from "@/lib/gallery";
import type { BookSummary, CanonicalTag, TagCategory } from "@/lib/types";

const PAGE_SIZE = 20;

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "5", label: "5 stars" },
  { value: "4.5", label: "4.5+" },
  { value: "4", label: "4+" },
  { value: "3", label: "3+" },
  { value: "unrated", label: "Unrated" },
];

// Type filter options
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fiction", label: "Fiction" },
  { value: "nonfiction", label: "Nonfiction" },
  { value: "poetry", label: "Poetry" },
];

// Which canonical tag categories to show per type in gallery view
const GALLERY_TAG_CATEGORIES: Record<string, TagCategory[]> = {
  fiction: ["vibe"],
  nonfiction: ["topic", "form", "depth"],
  poetry: ["movement", "formal_feel", "accessibility"],
};

function parseCommaSeparated(param: string | null): string[] {
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
  pagesMin: string;
  pagesMax: string;
  yearMin: string;
  yearMax: string;
}): boolean {
  return (
    params.status !== "any" ||
    params.rating !== "any" ||
    params.genre !== "any" ||
    params.pagesMin !== "" ||
    params.pagesMax !== "" ||
    params.yearMin !== "" ||
    params.yearMax !== ""
  );
}

function buildFilterSummary(params: {
  status: string;
  rating: string;
  genre: string;
  pagesMin: string;
  pagesMax: string;
  yearMin: string;
  yearMax: string;
}): string {
  const parts: string[] = [];
  if (params.status !== "any") parts.push(params.status);
  if (params.rating === "unrated") parts.push("unrated");
  else if (params.rating !== "any") parts.push(`${params.rating}+ stars`);
  if (params.genre !== "any") parts.push(params.genre);
  if (params.pagesMin && params.pagesMax) parts.push(`${params.pagesMin}–${params.pagesMax} pp`);
  else if (params.pagesMin) parts.push(`${params.pagesMin}+ pp`);
  else if (params.pagesMax) parts.push(`≤${params.pagesMax} pp`);
  if (params.yearMin && params.yearMax) parts.push(`${params.yearMin}–${params.yearMax}`);
  else if (params.yearMin) parts.push(`${params.yearMin}+`);
  else if (params.yearMax) parts.push(`≤${params.yearMax}`);
  return parts.join(" · ");
}

// ── Gallery Browse (Fiction / Nonfiction / Poetry tabs) ──

function GalleryBrowse({ bookType }: { bookType: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read tags from URL
  const initialTags = parseCommaSeparated(searchParams.get("tags"));

  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [canonicalTags, setCanonicalTags] = useState<CanonicalTag[]>([]);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Fade key: changes on every tag toggle to trigger grid crossfade
  const [fadeKey, setFadeKey] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  // Fetch canonical tags for this type
  useEffect(() => {
    const cats = GALLERY_TAG_CATEGORIES[bookType] ?? [];
    if (cats.length === 0) {
      setCanonicalTags([]);
      return;
    }
    Promise.all(cats.map((cat) => fetchCanonicalTags(cat)))
      .then((results) => setCanonicalTags(results.flat()))
      .catch(() => setCanonicalTags([]));
  }, [bookType]);

  // Sync tags to URL
  useEffect(() => {
    const params: Record<string, string> = { type: bookType };
    if (selectedTags.length > 0) params.tags = selectedTags.join(",");
    setSearchParams(params, { replace: true });
  }, [bookType, selectedTags, setSearchParams]);

  // Fetch books when tags change
  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setFadeIn(false);
    try {
      const result = await fetchGalleryBooks(bookType, selectedTags, 0);
      // Brief delay for crossfade out, then swap data
      await new Promise((r) => setTimeout(r, 150));
      setBooks(result.books);
      setTotalCount(result.totalCount);
      setFadeIn(true);
    } catch (err) {
      console.error("Gallery fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [bookType, selectedTags]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // Reset tags when type changes
  const prevType = useRef(bookType);
  useEffect(() => {
    if (prevType.current !== bookType) {
      prevType.current = bookType;
      setSelectedTags([]);
    }
  }, [bookType]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag],
    );
    setFadeKey((k) => k + 1);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await fetchGalleryBooks(
        bookType,
        selectedTags,
        books.length,
      );
      setBooks((prev) => [...prev, ...result.books]);
      setTotalCount(result.totalCount);
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = books.length < totalCount;
  const layout = bookType === "fiction" ? "cloud" : "stacked";

  return (
    <div className="space-y-8">
      {/* Tag pills */}
      <div className="max-w-5xl mx-auto">
        <TagPillBar
          tags={canonicalTags}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          layout={layout as "cloud" | "stacked"}
        />
      </div>

      {/* Result count */}
      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground text-right">
          {loading ? (
            "Loading..."
          ) : (
            <>
              Showing{" "}
              <span className="font-semibold text-foreground">{books.length}</span>{" "}
              of {totalCount.toLocaleString()} book{totalCount !== 1 ? "s" : ""}
            </>
          )}
        </p>
      </div>

      {/* Cover grid — full bleed */}
      <div className="w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20">
        <div
          key={fadeKey}
          className={`transition-opacity duration-300 ${fadeIn ? "opacity-100" : "opacity-0"}`}
        >
          {books.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {books.map((book, i) => (
                <div
                  key={book.id}
                  className="gallery-card-enter"
                  style={{
                    animationDelay: `${
                      // Only stagger for newly loaded items (beyond first batch)
                      i >= books.length - GALLERY_PAGE_SIZE
                        ? Math.min(i - (books.length - GALLERY_PAGE_SIZE), 30) * 40
                        : 0
                    }ms`,
                  }}
                >
                  <BookCoverCard
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    coverUrl={book.cover_image_url}
                  />
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="rounded-md border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
                No books match the selected tags.
              </div>
            )
          )}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-10 pb-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="h-11 px-8 rounded-full border border-border text-sm font-medium text-muted-foreground transition-all hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main BookList page ──

export function BookList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL
  const initialQuery = searchParams.get("q") ?? "";
  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialStatus = searchParams.get("status") ?? "any";
  const initialRating = searchParams.get("rating") ?? "any";
  const initialGenre = searchParams.get("genre") ?? "any";
  const initialType = searchParams.get("type") ?? "all";
  const initialPagesMin = searchParams.get("pages_min") ?? "";
  const initialPagesMax = searchParams.get("pages_max") ?? "";
  const initialYearMin = searchParams.get("year_min") ?? "";
  const initialYearMax = searchParams.get("year_max") ?? "";
  const view = searchParams.get("view") === "shelves" ? "shelves" : "list";

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [bookType, setBookType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [rating, setRating] = useState(initialRating);
  const [genre, setGenre] = useState(initialGenre);
  const [pagesMin, setPagesMin] = useState(initialPagesMin);
  const [pagesMax, setPagesMax] = useState(initialPagesMax);
  const [yearMin, setYearMin] = useState(initialYearMin);
  const [yearMax, setYearMax] = useState(initialYearMax);
  const [filtersOpen, setFiltersOpen] = useState(
    hasActiveFilters({
      status: initialStatus,
      rating: initialRating,
      genre: initialGenre,
      pagesMin: initialPagesMin,
      pagesMax: initialPagesMax,
      yearMin: initialYearMin,
      yearMax: initialYearMax,
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
  const prevDebouncedQuery = useRef(debouncedQuery);
  useEffect(() => {
    if (prevDebouncedQuery.current !== debouncedQuery) {
      prevDebouncedQuery.current = debouncedQuery;
      setPage(1);
    }
  }, [debouncedQuery]);

  // Sync state to URL params (All tab only — gallery manages its own URL)
  useEffect(() => {
    if (bookType !== "all") return;
    const params: Record<string, string> = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (page > 1) params.page = String(page);
    if (status !== "any") params.status = status;
    if (rating !== "any") params.rating = rating;
    if (genre !== "any") params.genre = genre;
    if (pagesMin) params.pages_min = pagesMin;
    if (pagesMax) params.pages_max = pagesMax;
    if (yearMin) params.year_min = yearMin;
    if (yearMax) params.year_max = yearMax;
    if (view === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }, [
    debouncedQuery,
    page,
    bookType,
    status,
    rating,
    genre,
    pagesMin,
    pagesMax,
    yearMin,
    yearMax,
    view,
    setSearchParams,
  ]);

  // Fetch books (All tab only)
  const fetchBooks = useCallback(async () => {
    if (bookType !== "all") return;
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("books")
      .select("id, title, author, book_type, status, rating, timing_raw, cover_image_url", {
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

    if (pagesMin) {
      q = q.gte("page_count", Number(pagesMin));
    }
    if (pagesMax) {
      q = q.lte("page_count", Number(pagesMax));
    }

    if (yearMin) {
      q = q.gte("publication_year", Number(yearMin));
    }
    if (yearMax) {
      q = q.lte("publication_year", Number(yearMax));
    }

    if (debouncedQuery) {
      const pattern = `%${debouncedQuery}%`;
      q = q.or(`title.ilike.${pattern},author.ilike.${pattern}`);
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
    bookType,
    status,
    rating,
    genre,
    pagesMin,
    pagesMax,
    yearMin,
    yearMax,
  ]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  const isGalleryTab = bookType !== "all";

  function handleTypeChange(type: string) {
    setBookType(type);
    setPage(1);
  }

  function clearFilters() {
    setStatus("any");
    setRating("any");
    setGenre("any");
    setPagesMin("");
    setPagesMax("");
    setYearMin("");
    setYearMax("");
    setPage(1);
  }

  const filterState = {
    status,
    rating,
    genre,
    pagesMin,
    pagesMax,
    yearMin,
    yearMax,
  };
  const active = hasActiveFilters(filterState);
  const summary = buildFilterSummary(filterState);

  function setView(v: "list" | "shelves") {
    const params: Record<string, string> = {};
    if (v === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }

  const activeFilterCount = [
    status !== "any",
    rating !== "any",
    genre !== "any",
    pagesMin !== "",
    pagesMax !== "",
    yearMin !== "",
    yearMax !== "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <ReadingQuote />

      {/* Tabs — centered accent underline */}
      <div className="flex justify-center gap-10 border-b border-border mb-2">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleTypeChange(opt.value)}
            className={`pb-3 text-sm font-semibold transition-colors border-b-[3px] ${
              bookType === opt.value
                ? "text-accent border-accent"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Gallery tabs (Fiction / Nonfiction / Poetry) */}
      {isGalleryTab ? (
        <GalleryBrowse bookType={bookType} />
      ) : (
        <>
          {/* View toggle — only on All tab */}
          <div className="flex justify-end">
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
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                  {activeFilterCount}
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

                  {/* Page count */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Pages
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="Min"
                        value={pagesMin}
                        onChange={(e) => { setPagesMin(e.target.value); setPage(1); }}
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={pagesMax}
                        onChange={(e) => { setPagesMax(e.target.value); setPage(1); }}
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Publication year */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Year
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="Min"
                        value={yearMin}
                        onChange={(e) => { setYearMin(e.target.value); setPage(1); }}
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={yearMax}
                        onChange={(e) => { setYearMax(e.target.value); setPage(1); }}
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
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
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
