import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchReleasesByMonth,
  fetchAvailableMonths,
  fetchLibraryIsbns,
  dismissRelease,
  undismissRelease,
  addReleaseToWishlist,
  fetchCuration,
  recordReleasesVisit,
  requestCuration,
} from "@/lib/releases";
import type { ReleaseView, ReleaseCategory, ReleaseCuration } from "@/lib/releases";
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
import { capture } from "@/lib/posthog";

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
  onDismiss: (releaseId: string, isbn13: string) => void;
  onUndismiss: (releaseId: string, isbn13: string) => void;
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
                      onClick={() => onUndismiss(release.id, release.isbn13)}
                      className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Undo dismiss
                    </button>
                  ) : (
                    <button
                      onClick={() => onDismiss(release.id, release.isbn13)}
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

function CurateInvite({
  state,
  onCurate,
}: {
  state: "idle" | "requesting" | "no_profile" | "error";
  onCurate: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border-2 border-dashed px-8 py-12 text-center">
      <p className="font-serif text-xl font-bold">Have your companion curate new releases</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Your companion reads through each month's notable releases and picks the ones that fit
        your reading. Your first picks usually arrive within the hour, and new months are curated
        as they come out while you keep visiting.
      </p>
      {state === "no_profile" ? (
        <p className="mt-6 text-sm">
          Your companion needs to know your taste first. Add a few more books to your library and
          rate at least five, and your reader profile will be ready within a few hours.
        </p>
      ) : (
        <button
          onClick={onCurate}
          disabled={state === "requesting"}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {state === "requesting" ? "Asking..." : "Curate for me"}
        </button>
      )}
      {state === "error" && (
        <p className="mt-3 text-sm text-destructive">That didn't go through. Please try again.</p>
      )}
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
  const [view, setView] = useState<ReleaseView>("notable");
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
  const [curation, setCuration] = useState<ReleaseCuration | null>(null);
  const [curateState, setCurateState] = useState<"idle" | "requesting" | "no_profile" | "error">("idle");

  // Fetch available months, library ISBNs, and curation once
  useEffect(() => {
    // A failed curation lookup leaves the page usable, as if the reader hadn't asked
    const curationOrNone = fetchCuration().catch((err) => {
      console.error("Error fetching curation:", err);
      return null;
    });
    Promise.all([fetchAvailableMonths(), fetchLibraryIsbns(), curationOrNone])
      .then(([months, isbns, curationRow]) => {
        setAvailableMonths(months);
        setLibraryIsbns(isbns);
        // Readers who asked for curation land on their picks
        setCuration(curationRow);
        if (curationRow) {
          setView("recommended");
          recordReleasesVisit(curationRow).catch(console.error);
        }

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

  // Fetch releases when year/month/page/view/showDismissed changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchReleasesByMonth(year, month, page, view, showDismissed, category);
      setReleases(result.releases);
      setTotal(result.total);
    } catch (err) {
      console.error("Error fetching releases:", err);
    }
    setLoading(false);
  }, [year, month, page, view, showDismissed, category]);

  // Wait for the initial month and view, so the first fetch is the right one
  useEffect(() => {
    if (initialized) void fetchData();
  }, [fetchData, initialized]);

  // Reset page + collapse when month changes
  function handleMonthChange(value: string) {
    const [y, m] = value.split("-").map(Number);
    setYear(y);
    setMonth(m);
    setPage(1);
    setExpandedId(null);
  }

  function handleViewChange(newView: ReleaseView) {
    setView(newView);
    setPage(1);
    setExpandedId(null);
  }

  async function handleCurate() {
    setCurateState("requesting");
    try {
      const result = await requestCuration();
      if (result === "no_profile") {
        setCurateState("no_profile");
        return;
      }
      capture("release_curation_requested");
      const now = result.requested_at;
      setCuration({ requested_at: now, last_visited_at: now });
      setCurateState("idle");
      handleViewChange("recommended");
    } catch (err) {
      console.error("Error requesting curation:", err);
      setCurateState("error");
    }
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleDismiss(releaseId: string, isbn13: string) {
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
      await dismissRelease(releaseId);
    } catch (err) {
      console.error("Error dismissing release:", err);
      void fetchData();
    }
  }

  async function handleUndismiss(releaseId: string, isbn13: string) {
    setReleases((prev) => prev.map((r) =>
      r.isbn13 === isbn13 ? { ...r, dismissed: false } : r
    ));
    try {
      await undismissRelease(releaseId);
    } catch (err) {
      console.error("Error undismissing release:", err);
      void fetchData();
    }
  }

  async function handleWishlist(release: NewRelease) {
    try {
      await addReleaseToWishlist(release);
      capture("release_wishlisted");
      setLibraryIsbns((prev) => new Set(prev).add(release.isbn13));
      setAddedIsbns((prev) => new Set(prev).add(release.isbn13));
    } catch (err) {
      console.error("Error adding to wishlist:", err);
    }
  }

  const totalPages = Math.ceil(total / 24);
  const selectedMonthKey = `${year}-${month}`;
  const monthLabel = formatMonthLabel(year, month);
  // Picks are on their way for a couple of hours after asking
  const curationPending =
    curation != null && Date.now() - new Date(curation.requested_at).getTime() < 2 * 60 * 60 * 1000;
  const showCurateInvite = view === "recommended" && curation == null;

  // No data at all
  if (initialized && availableMonths.length === 0) {
    return (
      <div className="-mx-4 -mt-6">
        <div className="w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20 pb-16 pt-8 lg:pt-12">
          <h1 className="font-serif text-3xl font-bold tracking-tight">New Releases</h1>
          <div className="mt-8 rounded-xl border-2 border-dashed px-8 py-12 text-center">
            <p className="font-serif text-lg font-bold">No releases yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              New releases will appear here as they become available.
            </p>
          </div>
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
              onClick={() => handleViewChange("recommended")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                view === "recommended"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Recommended
            </button>
            <button
              onClick={() => handleViewChange("notable")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                view === "notable"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Notable
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
          {loading || showCurateInvite
            ? showCurateInvite ? "" : "Loading..."
            : view === "recommended"
              ? `${total.toLocaleString()} pick${total !== 1 ? "s" : ""} for you in ${monthLabel}`
              : `${total.toLocaleString()} notable release${total !== 1 ? "s" : ""} in ${monthLabel}`}
        </p>
        <div className="flex items-center gap-3">
          {view === "notable" && curation == null && (
            <button
              onClick={() => handleViewChange("recommended")}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Get picks for you
            </button>
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

      {/* Invitation to curate, before the reader has asked */}
      {showCurateInvite && (
        <CurateInvite state={curateState} onCurate={handleCurate} />
      )}

      {/* Grid with inline detail */}
      {!showCurateInvite && !loading && releases.length > 0 && (
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
      {!showCurateInvite && !loading && releases.length === 0 && (
        <p className="mx-auto max-w-xl py-8 text-center text-muted-foreground">
          {view === "notable"
            ? `No notable releases for ${monthLabel} yet. New months are scored within a few hours of arriving.`
            : curationPending
              ? "Your companion is reading through this month's notable releases. Your picks usually arrive within the hour."
              : `No picks for you in ${monthLabel}. Your companion curates the current month, and next month from the 25th, so months before you asked aren't curated.`}
        </p>
      )}

      {/* Pagination */}
      {!showCurateInvite && totalPages > 1 && (
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
