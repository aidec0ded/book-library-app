import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchReleasesByMonth,
  fetchAvailableMonths,
  fetchLibraryIsbns,
} from "@/lib/releases";
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
import type { NewRelease } from "@/lib/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
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

  const [releases, setReleases] = useState<NewRelease[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [availableMonths, setAvailableMonths] = useState<
    { year: number; month: number; count: number }[]
  >([]);
  const [libraryIsbns, setLibraryIsbns] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch available months + library ISBNs once
  useEffect(() => {
    Promise.all([fetchAvailableMonths(), fetchLibraryIsbns()])
      .then(([months, isbns]) => {
        setAvailableMonths(months);
        setLibraryIsbns(isbns);
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

  // Fetch releases when year/month/page changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchReleasesByMonth(year, month, page);
      setReleases(result.releases);
      setTotal(result.total);
    } catch (err) {
      console.error("Error fetching releases:", err);
    }
    setLoading(false);
  }, [year, month, page]);

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

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const totalPages = Math.ceil(total / 24);
  const selectedMonthKey = `${year}-${month}`;
  const expandedRelease = expandedId
    ? releases.find((r) => r.id === expandedId) ?? null
    : null;

  // No data at all
  if (initialized && availableMonths.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-bold">New Releases</h1>
        <p className="text-muted-foreground">
          No release data yet. Run the ingestion script to get started.
        </p>
        <pre className="rounded-md bg-secondary px-4 py-3 text-sm">
          npx tsx scripts/ingest-releases.ts
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-2xl font-bold">New Releases</h1>
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

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {loading
          ? "Loading..."
          : `${total.toLocaleString()} release${total !== 1 ? "s" : ""} in ${formatMonthLabel(year, month)}`}
      </p>

      {/* Grid */}
      {!loading && releases.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {releases.map((release) => {
            const inLibrary =
              libraryIsbns.has(release.isbn13) ||
              (release.isbn10 != null && libraryIsbns.has(release.isbn10));

            return (
              <button
                key={release.id}
                onClick={() => toggleExpanded(release.id)}
                className={`group relative text-left transition-opacity ${
                  expandedId && expandedId !== release.id ? "opacity-60" : ""
                }`}
              >
                {/* In Library badge */}
                {inLibrary && (
                  <Badge
                    variant="secondary"
                    className="absolute top-1 right-1 z-10 text-[10px] shadow-sm"
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
                <div className="mt-1.5 space-y-0.5">
                  <p className="font-serif text-sm font-medium leading-tight line-clamp-2">
                    {release.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {release.authors.join(", ") || "Unknown author"}
                  </p>
                  {(release.publisher || release.binding) && (
                    <p className="text-xs text-muted-foreground/70 line-clamp-1">
                      {[release.publisher, release.binding]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded detail */}
      {expandedRelease && (
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="shrink-0">
                <BookCover
                  title={expandedRelease.title}
                  author={expandedRelease.authors.join(", ") || "Unknown"}
                  coverUrl={expandedRelease.cover_image_url}
                  size="lg"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <h2 className="font-serif text-xl font-bold">
                    {expandedRelease.title}
                  </h2>
                  <p className="text-muted-foreground">
                    {expandedRelease.authors.join(", ") || "Unknown author"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {expandedRelease.publisher && (
                    <span>{expandedRelease.publisher}</span>
                  )}
                  {expandedRelease.date_published && (
                    <span>{expandedRelease.date_published}</span>
                  )}
                  {expandedRelease.page_count && (
                    <span>{expandedRelease.page_count} pages</span>
                  )}
                  {expandedRelease.binding && (
                    <span>{expandedRelease.binding}</span>
                  )}
                  {expandedRelease.language && (
                    <span>{expandedRelease.language}</span>
                  )}
                  {expandedRelease.isbn13 && (
                    <span className="font-mono text-xs">
                      ISBN {expandedRelease.isbn13}
                    </span>
                  )}
                </div>

                {expandedRelease.synopsis && (
                  <p className="text-sm leading-relaxed">
                    {expandedRelease.synopsis}
                  </p>
                )}

                {expandedRelease.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {expandedRelease.subjects.map((subject) => (
                      <Badge key={subject} variant="outline" className="text-xs">
                        {subject}
                      </Badge>
                    ))}
                  </div>
                )}

                {(libraryIsbns.has(expandedRelease.isbn13) ||
                  (expandedRelease.isbn10 != null &&
                    libraryIsbns.has(expandedRelease.isbn10))) && (
                  <Badge variant="secondary">In Library</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state for selected month */}
      {!loading && releases.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          No releases found for {formatMonthLabel(year, month)}.
        </p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              setExpandedId(null);
            }}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              setExpandedId(null);
            }}
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
