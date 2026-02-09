import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchReleasesByMonth,
  fetchAvailableMonths,
  fetchLibraryIsbns,
  dismissRelease,
  undismissRelease,
  addReleaseToWishlist,
} from "@/lib/releases";
import type { ReleaseSort, ReleaseCategory } from "@/lib/releases";
import { ExternalLink } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pagination } from "@/components/Pagination";
import type { NewRelease } from "@/lib/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function scoreBadgeColor(score: number): string {
  if (score >= 8) return "bg-amber-100 text-amber-800 border-amber-300";
  if (score >= 6) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (score >= 4) return "bg-neutral-100 text-neutral-600 border-neutral-300";
  return "bg-neutral-50 text-neutral-400 border-neutral-200";
}

function useGridColumns(gridRef: React.RefObject<HTMLDivElement | null>): number {
  const [cols, setCols] = useState(6);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    function measure() {
      if (!gridRef.current) return;
      const style = getComputedStyle(gridRef.current);
      const templateCols = style.gridTemplateColumns.split(" ").length;
      setCols(templateCols);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridRef]);

  return cols;
}

interface ReleaseGridProps {
  releases: NewRelease[];
  expandedId: string | null;
  libraryIsbns: Set<string>;
  addedIsbns: Set<string>;
  onToggleExpanded: (id: string) => void;
  onDismiss: (isbn13: string) => void;
  onUndismiss: (isbn13: string) => void;
  onWishlist: (release: NewRelease) => void;
  onClickOutside: () => void;
  scoreBadgeColor: (score: number) => string;
}

function ReleaseGrid({
  releases,
  expandedId,
  libraryIsbns,
  addedIsbns,
  onToggleExpanded,
  onDismiss,
  onUndismiss,
  onWishlist,
  onClickOutside,
  scoreBadgeColor,
}: ReleaseGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const cols = useGridColumns(gridRef);

  const expandedRelease = expandedId
    ? releases.find((r) => r.id === expandedId) ?? null
    : null;

  // Find which row the expanded item is in
  const expandedIndex = expandedId
    ? releases.findIndex((r) => r.id === expandedId)
    : -1;
  const insertAfterIndex =
    expandedIndex >= 0 ? Math.min((Math.floor(expandedIndex / cols) + 1) * cols, releases.length) - 1 : -1;

  // Click outside to close
  useEffect(() => {
    if (!expandedId) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (detailRef.current?.contains(target)) return;
      // Check if click was on a grid card button — those handle their own toggle
      if (gridRef.current?.contains(target)) return;
      onClickOutside();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expandedId, onClickOutside]);

  // Scroll detail into view when it appears
  useEffect(() => {
    if (expandedId && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedId]);

  function renderCard(release: NewRelease) {
    const inLibrary =
      libraryIsbns.has(release.isbn13) ||
      (release.isbn10 != null && libraryIsbns.has(release.isbn10));

    return (
      <button
        key={release.id}
        onClick={() => onToggleExpanded(release.id)}
        className={`group text-left transition-opacity ${
          expandedId && expandedId !== release.id ? "opacity-60" : ""
        } ${release.dismissed ? "opacity-40" : ""}`}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
          {release.ai_score != null && (
            <div
              className={`absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold shadow-sm ${scoreBadgeColor(release.ai_score)}`}
            >
              {Math.round(release.ai_score)}
            </div>
          )}
          {inLibrary && (
            <Badge
              variant="secondary"
              className="absolute top-2 right-2 z-10 text-[10px] shadow-sm"
            >
              In Library
            </Badge>
          )}
          <BookCover
            title={release.title}
            author={release.authors.join(", ") || "Unknown"}
            coverUrl={release.cover_image_url}
            size="sm"
          />
        </div>
        <div className="mt-3">
          <p className="font-serif text-base font-bold leading-tight line-clamp-2">
            {release.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {release.authors.join(", ") || "Unknown author"}
          </p>
          {(release.publisher || release.binding) && (
            <p className="mt-0.5 text-xs text-muted-foreground/70 line-clamp-1">
              {[release.publisher, release.binding]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </button>
    );
  }

  function renderDetail(release: NewRelease) {
    const inLibrary =
      libraryIsbns.has(release.isbn13) ||
      (release.isbn10 != null && libraryIsbns.has(release.isbn10));

    return (
      <div ref={detailRef} className="col-span-full">
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="shrink-0">
                <BookCover
                  title={release.title}
                  author={release.authors.join(", ") || "Unknown"}
                  coverUrl={release.cover_image_url}
                  size="lg"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <h2 className="font-serif text-xl font-bold">
                    {release.title}
                  </h2>
                  <p className="text-muted-foreground">
                    {release.authors.join(", ") || "Unknown author"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {release.publisher && <span>{release.publisher}</span>}
                  {release.date_published && <span>{release.date_published}</span>}
                  {release.page_count && <span>{release.page_count} pages</span>}
                  {release.binding && <span>{release.binding}</span>}
                  {release.language && <span>{release.language}</span>}
                  {release.isbn13 && (
                    <span className="font-mono text-xs">ISBN {release.isbn13}</span>
                  )}
                </div>

                {release.synopsis && (
                  <p className="text-sm leading-relaxed">{release.synopsis}</p>
                )}

                {release.ai_rationale && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-900">
                      <span className="font-medium">Why this book: </span>
                      {release.ai_rationale}
                    </p>
                    {(release.general_signal_score != null ||
                      release.personal_score != null) && (
                      <p className="mt-1.5 text-xs text-amber-700">
                        {[
                          release.general_signal_score != null
                            ? `Signal: ${release.general_signal_score}/10`
                            : null,
                          release.personal_score != null
                            ? `Personal: ${release.personal_score}/10`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </p>
                    )}
                  </div>
                )}

                {release.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {release.subjects.map((subject) => (
                      <Badge key={subject} variant="outline" className="text-xs">
                        {subject}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {inLibrary ? (
                    <Badge variant="secondary">In Library</Badge>
                  ) : addedIsbns.has(release.isbn13) ? (
                    <button
                      disabled
                      className="rounded-md border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      Added
                    </button>
                  ) : (
                    <button
                      onClick={() => onWishlist(release)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Want to Read
                    </button>
                  )}

                  {release.dismissed ? (
                    <button
                      onClick={() => onUndismiss(release.isbn13)}
                      className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Undo dismiss
                    </button>
                  ) : (
                    <button
                      onClick={() => onDismiss(release.isbn13)}
                      className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Not interested
                    </button>
                  )}

                  {release.isbn13 && (
                    <a
                      href={`https://bookshop.org/books?keywords=${release.isbn13}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Bookshop.org
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build items with detail card inserted after the correct row
  const items: React.ReactNode[] = [];
  for (let i = 0; i < releases.length; i++) {
    items.push(renderCard(releases[i]));
    if (i === insertAfterIndex && expandedRelease) {
      items.push(
        <React.Fragment key={`detail-${expandedRelease.id}`}>
          {renderDetail(expandedRelease)}
        </React.Fragment>,
      );
    }
  }

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-2 gap-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {items}
    </div>
  );
}

export function ReleasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const initialYear = Number(searchParams.get("year") || defaultYear);
  const initialMonth = Number(searchParams.get("month") || defaultMonth);
  const initialPage = Number(searchParams.get("page") || 1);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [page, setPage] = useState(initialPage);
  const [sort, setSort] = useState<ReleaseSort>("score");
  const [category, setCategory] = useState<ReleaseCategory>("all");
  const [showDismissed, setShowDismissed] = useState(false);

  const [releases, setReleases] = useState<NewRelease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [availableMonths, setAvailableMonths] = useState<
    { year: number; month: number; count: number }[]
  >([]);
  const [libraryIsbns, setLibraryIsbns] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addedIsbns, setAddedIsbns] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch available months + library ISBNs once
  useEffect(() => {
    Promise.all([fetchAvailableMonths(), fetchLibraryIsbns()])
      .then(([months, isbns]) => {
        setAvailableMonths(months);
        setLibraryIsbns(isbns);

        // If the default month isn't in the available data, fall back to the
        // closest available month so the Select always has a matching value.
        if (months.length > 0) {
          const hasSelected = months.some(
            (m) => m.year === year && m.month === month,
          );
          if (!hasSelected) {
            // Pick the month closest to the current date
            const target = year * 12 + month;
            let best = months[0];
            let bestDist = Math.abs(best.year * 12 + best.month - target);
            for (const m of months) {
              const dist = Math.abs(m.year * 12 + m.month - target);
              if (dist < bestDist) {
                best = m;
                bestDist = dist;
              }
            }
            setYear(best.year);
            setMonth(best.month);
            setPage(1);
          }
        }

        setInitialized(true);
      })
      .catch(console.error);
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (year !== defaultYear || month !== defaultMonth) {
      params.year = String(year);
      params.month = String(month);
    }
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [year, month, page, defaultYear, defaultMonth, setSearchParams]);

  // Fetch releases when year/month/page/sort/showDismissed changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchReleasesByMonth(year, month, page, sort, showDismissed, category);
      setReleases(result.releases);
      setTotal(result.total);
    } catch (err) {
      console.error("Error fetching releases:", err);
    }
    setLoading(false);
  }, [year, month, page, sort, showDismissed, category]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Reset page + collapse when month changes
  function handleMonthChange(value: string) {
    const [y, m] = value.split("-").map(Number);
    setYear(y);
    setMonth(m);
    setPage(1);
    setExpandedId(null);
  }

  function handleSortChange(newSort: ReleaseSort) {
    setSort(newSort);
    setPage(1);
    setExpandedId(null);
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleDismiss(isbn13: string) {
    // Optimistic update
    setReleases((prev) => prev.map((r) =>
      r.isbn13 === isbn13 ? { ...r, dismissed: true } : r
    ));
    if (!showDismissed) {
      setReleases((prev) => prev.filter((r) => r.isbn13 !== isbn13));
      setTotal((prev) => prev - 1);
      setExpandedId(null);
    }
    try {
      await dismissRelease(isbn13);
    } catch (err) {
      console.error("Error dismissing release:", err);
      void fetchData();
    }
  }

  async function handleUndismiss(isbn13: string) {
    setReleases((prev) => prev.map((r) =>
      r.isbn13 === isbn13 ? { ...r, dismissed: false } : r
    ));
    try {
      await undismissRelease(isbn13);
    } catch (err) {
      console.error("Error undismissing release:", err);
      void fetchData();
    }
  }

  async function handleWishlist(release: NewRelease) {
    try {
      await addReleaseToWishlist(release);
      setLibraryIsbns((prev) => new Set(prev).add(release.isbn13));
      setAddedIsbns((prev) => new Set(prev).add(release.isbn13));
    } catch (err) {
      console.error("Error adding to wishlist:", err);
    }
  }

  const totalPages = Math.ceil(total / 24);
  const selectedMonthKey = `${year}-${month}`;
  const scoredCount = releases.filter((r) => r.ai_score != null).length;
  const anyScored = scoredCount > 0 || releases.length === 0;

  // No data at all
  if (initialized && availableMonths.length === 0) {
    return (
      <div className="-mx-4 -mt-6">
        <div className="w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20 pb-16 pt-8 lg:pt-12">
          <h1 className="font-serif text-3xl font-bold tracking-tight">New Releases</h1>
          <p className="mt-4 text-muted-foreground">
            No release data yet. Run the ingestion script to get started.
          </p>
          <pre className="mt-2 rounded-md bg-secondary px-4 py-3 text-sm">
            npx tsx scripts/ingest-releases.ts
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-6">
      <div className="w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20 pb-16 pt-8 lg:pt-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-serif text-3xl font-bold tracking-tight">New Releases</h1>
        <div className="flex items-center gap-3">
          {/* Sort toggle */}
          <div className="flex rounded-md border">
            <button
              onClick={() => handleSortChange("score")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                sort === "score"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Recommended
            </button>
            <button
              onClick={() => handleSortChange("title")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                sort === "title"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              All
            </button>
          </div>

          {/* Category filter */}
          <div className="flex rounded-md border">
            {(["all", "fiction", "nonfiction"] as ReleaseCategory[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  setPage(1);
                  setExpandedId(null);
                }}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  category === c
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {c === "all" ? "All" : c === "fiction" ? "Fiction" : "Nonfiction"}
              </button>
            ))}
          </div>

          {availableMonths.length > 0 && (
            <Select value={selectedMonthKey} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {formatMonthLabel(m.year, m.month)} ({m.count.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Count + scoring status */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : `${total.toLocaleString()} release${total !== 1 ? "s" : ""} in ${formatMonthLabel(year, month)}`}
        </p>
        <div className="flex items-center gap-3">
          {!loading && !anyScored && (
            <p className="text-xs text-muted-foreground">
              Not scored yet. Run: <code className="rounded bg-secondary px-1 py-0.5">npx tsx scripts/score-releases.ts --month {year}-{String(month).padStart(2, "0")}</code>
            </p>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDismissed}
              onChange={(e) => {
                setShowDismissed(e.target.checked);
                setPage(1);
                setExpandedId(null);
              }}
              className="rounded"
            />
            Show dismissed
          </label>
        </div>
      </div>

      {/* Grid with inline detail */}
      {!loading && releases.length > 0 && (
        <ReleaseGrid
          releases={releases}
          expandedId={expandedId}
          libraryIsbns={libraryIsbns}
          addedIsbns={addedIsbns}
          onToggleExpanded={toggleExpanded}
          onDismiss={handleDismiss}
          onUndismiss={handleUndismiss}
          onWishlist={handleWishlist}
          onClickOutside={() => setExpandedId(null)}
          scoreBadgeColor={scoreBadgeColor}
        />
      )}

      {/* Empty state for selected month */}
      {!loading && releases.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          No releases found for {formatMonthLabel(year, month)}.
        </p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => {
            setPage(p);
            setExpandedId(null);
          }}
        />
      )}
      </div>
    </div>
  );
}
