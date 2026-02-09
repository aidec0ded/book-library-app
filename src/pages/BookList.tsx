import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Pagination } from "@/components/Pagination";
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
import { TagPillBar } from "@/components/TagPillBar";
import { BookCoverCard } from "@/components/BookCoverCard";
import {
  fetchBookIdsByCanonicalVibes,
  fetchCanonicalVibesForBooks,
} from "@/lib/vibes";
import { fetchDistinctGenres } from "@/lib/filters";
import {
  fetchCanonicalTags,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import { fetchGalleryBooks, GALLERY_PAGE_SIZE } from "@/lib/gallery";
import { MONTH_NAMES } from "@/lib/timing";
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

// Which canonical tag categories to show as multi-select badges per type (All tab)
const MULTI_SELECT_CATEGORIES: Record<string, TagCategory[]> = {
  all: ["vibe"],
};

// Which canonical tag categories to show as single-select dropdowns per type (All tab)
const SINGLE_SELECT_CATEGORIES: Record<
  string,
  { category: TagCategory; label: string }[]
> = {
  all: [],
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
  month: string;
  tags: string[];
  singleTags: Map<TagCategory, string>;
  showAll: boolean;
}): boolean {
  return (
    params.status !== "any" ||
    params.rating !== "any" ||
    params.genre !== "any" ||
    params.month !== "any" ||
    params.tags.length > 0 ||
    Array.from(params.singleTags.values()).some((v) => v !== "any") ||
    params.showAll
  );
}

function buildFilterSummary(params: {
  status: string;
  rating: string;
  genre: string;
  month: string;
  tags: string[];
  singleTags: Map<TagCategory, string>;
  showAll: boolean;
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
  if (params.tags.length > 0)
    parts.push(params.tags.map(formatCanonicalVibe).join(", "));
  for (const [, val] of params.singleTags) {
    if (val !== "any") parts.push(formatCanonicalVibe(val));
  }
  if (params.showAll) parts.push("all books");
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
  const initialMonth = searchParams.get("month") ?? "any";
  const initialType = searchParams.get("type") ?? "all";
  const initialTags = parseCommaSeparated(searchParams.get("tags"));
  const initialShowAll = searchParams.get("all") === "1";
  const view = searchParams.get("view") === "shelves" ? "shelves" : "list";

  // Parse single-select tag params from URL
  function parseInitialSingleTags(): Map<TagCategory, string> {
    const map = new Map<TagCategory, string>();
    for (const key of ["form", "depth", "accessibility"] as TagCategory[]) {
      map.set(key, searchParams.get(key) ?? "any");
    }
    return map;
  }

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
  const [month, setMonth] = useState(initialMonth);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [singleTags, setSingleTags] = useState<Map<TagCategory, string>>(
    parseInitialSingleTags,
  );
  const [showAll, setShowAll] = useState(initialShowAll);
  const [filtersOpen, setFiltersOpen] = useState(
    hasActiveFilters({
      status: initialStatus,
      rating: initialRating,
      genre: initialGenre,
      month: initialMonth,
      tags: initialTags,
      singleTags: parseInitialSingleTags(),
      showAll: initialShowAll,
    }),
  );

  // Canonical tags for current type's categories (fetched from DB) — All tab only
  const [canonicalTags, setCanonicalTags] = useState<CanonicalTag[]>([]);

  // Fetch canonical tags when book type changes (only for All tab)
  useEffect(() => {
    if (bookType !== "all") {
      setCanonicalTags([]);
      return;
    }
    const multiCats = MULTI_SELECT_CATEGORIES[bookType] ?? [];
    const singleCats = (SINGLE_SELECT_CATEGORIES[bookType] ?? []).map(
      (c) => c.category,
    );
    const allCats = [...multiCats, ...singleCats];
    if (allCats.length === 0) {
      setCanonicalTags([]);
      return;
    }
    Promise.all(allCats.map((cat) => fetchCanonicalTags(cat)))
      .then((results) => setCanonicalTags(results.flat()))
      .catch(() => setCanonicalTags([]));
  }, [bookType]);

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
    if (month !== "any") params.month = month;
    if (selectedTags.length > 0) params.tags = selectedTags.join(",");
    for (const [key, val] of singleTags) {
      if (val !== "any") params[key] = val;
    }
    if (showAll) params.all = "1";
    if (view === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }, [
    debouncedQuery,
    page,
    bookType,
    status,
    rating,
    genre,
    month,
    selectedTags,
    singleTags,
    showAll,
    view,
    setSearchParams,
  ]);

  // Fetch books (All tab only)
  const fetchBooks = useCallback(async () => {
    if (bookType !== "all") return;
    setLoading(true);

    // Collect all selected canonical tags (multi + single)
    const allSelectedTags = [...selectedTags];
    for (const [, val] of singleTags) {
      if (val !== "any") allSelectedTags.push(val);
    }

    // If tags are selected, first get matching book IDs
    let tagBookIds: string[] | null = null;
    if (allSelectedTags.length > 0) {
      tagBookIds = await fetchBookIdsByCanonicalVibes(allSelectedTags);
      if (tagBookIds.length === 0) {
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

    if (month !== "any") {
      q = q.eq("timing_month", Number(month));
    }

    // "Show all" toggle
    if (!showAll) {
      q = q.or("timing_raw.not.is.null,status.eq.wishlist,status.eq.reading");
    }

    if (debouncedQuery) {
      const pattern = `%${debouncedQuery}%`;
      q = q.or(`title.ilike.${pattern},author.ilike.${pattern}`);
    }

    if (tagBookIds) {
      q = q.in("id", tagBookIds);
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
    month,
    selectedTags,
    singleTags,
    showAll,
  ]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  const isGalleryTab = bookType !== "all";

  function handleTypeChange(type: string) {
    setBookType(type);
    // Clear type-specific filters when type changes
    setSelectedTags([]);
    setSingleTags(new Map([
      ["form", "any"],
      ["depth", "any"],
      ["accessibility", "any"],
    ] as [TagCategory, string][]));
    setMonth("any");
    setShowAll(false);
    setPage(1);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag],
    );
    setPage(1);
  }

  function setSingleTag(category: TagCategory, value: string) {
    setSingleTags((prev) => {
      const next = new Map(prev);
      next.set(category, value);
      return next;
    });
    setPage(1);
  }

  function clearFilters() {
    setStatus("any");
    setRating("any");
    setGenre("any");
    setMonth("any");
    setSelectedTags([]);
    setSingleTags(new Map([
      ["form", "any"],
      ["depth", "any"],
      ["accessibility", "any"],
    ] as [TagCategory, string][]));
    setShowAll(false);
    setPage(1);
  }

  const filterState = {
    status,
    rating,
    genre,
    month,
    tags: selectedTags,
    singleTags,
    showAll,
  };
  const active = hasActiveFilters(filterState);
  const summary = buildFilterSummary(filterState);

  // Group canonical tags by category for rendering (All tab)
  const tagsByCategory = useMemo(() => {
    const map = new Map<TagCategory, CanonicalTag[]>();
    for (const t of canonicalTags) {
      const existing = map.get(t.tag_category);
      if (existing) existing.push(t);
      else map.set(t.tag_category, [t]);
    }
    return map;
  }, [canonicalTags]);

  function setView(v: "list" | "shelves") {
    const params: Record<string, string> = {};
    if (v === "shelves") params.view = "shelves";
    setSearchParams(params, { replace: true });
  }

  // All tab filter controls
  const showMonth = true;
  const showGenre = true;
  const multiCats = MULTI_SELECT_CATEGORIES["all"] ?? [];
  const singleCats = SINGLE_SELECT_CATEGORIES["all"] ?? [];

  const categoryLabels: Record<string, string> = {
    vibe: "Vibes",
    topic: "Topics",
    movement: "Movement",
    formal_feel: "Formal Feel",
  };

  const activeFilterCount = [
    status !== "any",
    rating !== "any",
    genre !== "any",
    month !== "any",
    selectedTags.length > 0,
    ...Array.from(singleTags.values()).map((v) => v !== "any"),
    showAll,
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
                  {showGenre && (
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
                  )}

                  {/* Month */}
                  {showMonth && (
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
                  )}

                  {/* Single-select tag categories */}
                  {singleCats.map(({ category, label }) => {
                    const tags = tagsByCategory.get(category) ?? [];
                    return (
                      <div key={category} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {label}
                        </label>
                        <Select
                          value={singleTags.get(category) ?? "any"}
                          onValueChange={(v) => setSingleTag(category, v)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            {tags.map((t) => (
                              <SelectItem key={t.tag} value={t.tag}>
                                {formatCanonicalVibe(t.tag)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {/* Show all toggle */}
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

                {/* Multi-select tag categories (vibes) */}
                {multiCats.map((category) => {
                  const tags = tagsByCategory.get(category) ?? [];
                  if (tags.length === 0) return null;
                  return (
                    <div key={category} className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {categoryLabels[category] ?? formatCanonicalVibe(category)}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((ct) => {
                          const isActive = selectedTags.includes(ct.tag);
                          return (
                            <Badge
                              key={ct.tag}
                              variant={isActive ? "default" : "outline"}
                              className={`cursor-pointer transition-opacity ${
                                isActive ? "" : "opacity-60 hover:opacity-90"
                              }`}
                              title={ct.description}
                              onClick={() => toggleTag(ct.tag)}
                            >
                              {formatCanonicalVibe(ct.tag)}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

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
