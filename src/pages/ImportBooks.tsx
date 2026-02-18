import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { linkExternalItemsToBook } from "@/lib/lists";
import { capture } from "@/lib/posthog";
import {
  parseGoodreadsCSV,
  getShelfCounts,
  mapGoodreadsRow,
  makeMatchKey,
  type GoodreadsRow,
  type ParsedGoodreadsBook,
} from "@/lib/goodreads";

type Step = "upload" | "preview" | "importing" | "summary";

const BATCH_SIZE = 50;

export function ImportBooks() {
  const [importSearchParams] = useSearchParams();
  const fromOnboarding = importSearchParams.get("from") === "onboarding";
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<GoodreadsRow[]>([]);
  const [shelfCounts, setShelfCounts] = useState<Record<string, number>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview config
  const [selectedShelves, setSelectedShelves] = useState<Set<string>>(
    new Set(["read", "currently-reading"]),
  );
  const [toReadStatus, setToReadStatus] = useState<"unread" | "wishlist">(
    "unread",
  );
  const [existingISBNs, setExistingISBNs] = useState<Set<string>>(new Set());
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [dedupLoading, setDedupLoading] = useState(false);

  // Import progress
  const [importedCount, setImportedCount] = useState(0);
  const [totalToImport, setTotalToImport] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  // Build the filtered + deduped book list for preview stats
  const getMappedBooks = useCallback((): ParsedGoodreadsBook[] => {
    return rows
      .filter((r) => selectedShelves.has((r["Exclusive Shelf"] || "").trim()))
      .map((r) => mapGoodreadsRow(r, toReadStatus));
  }, [rows, selectedShelves, toReadStatus]);

  const getDedupedBooks = useCallback((): {
    toImport: ParsedGoodreadsBook[];
    dupCount: number;
  } => {
    const mapped = getMappedBooks();
    const toImport: ParsedGoodreadsBook[] = [];
    let dupCount = 0;
    for (const book of mapped) {
      const isbnDup = book.isbn && existingISBNs.has(book.isbn);
      const keyDup = existingKeys.has(book.matchKey);
      if (isbnDup || keyDup) {
        dupCount++;
      } else {
        toImport.push(book);
      }
    }
    return { toImport, dupCount };
  }, [getMappedBooks, existingISBNs, existingKeys]);

  // Load existing library for dedup on preview mount
  useEffect(() => {
    if (step !== "preview") return;
    let cancelled = false;

    async function loadExisting() {
      setDedupLoading(true);
      const { data, error } = await supabase
        .from("books")
        .select("isbn, title, author");
      if (cancelled) return;
      if (error) {
        console.error("Failed to load library for dedup:", error);
        setDedupLoading(false);
        return;
      }

      const isbns = new Set<string>();
      const keys = new Set<string>();
      for (const row of data || []) {
        if (row.isbn) isbns.add(row.isbn);
        if (row.title && row.author) {
          keys.add(makeMatchKey(row.title, row.author));
        }
      }
      setExistingISBNs(isbns);
      setExistingKeys(keys);
      setDedupLoading(false);
    }

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // --- Upload Step ---

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseGoodreadsCSV(text);
        setRows(parsed);
        setShelfCounts(getShelfCounts(parsed));
        // Default: check read + currently-reading
        const shelves = new Set<string>();
        const counts = getShelfCounts(parsed);
        if (counts["read"]) shelves.add("read");
        if (counts["currently-reading"]) shelves.add("currently-reading");
        setSelectedShelves(shelves);
        setStep("preview");
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Failed to parse CSV file.",
        );
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  }

  // --- Import Step ---

  async function startImport() {
    const { toImport, dupCount } = getDedupedBooks();
    setSkippedCount(dupCount);
    setTotalToImport(toImport.length);
    setImportedCount(0);
    setImportErrors([]);
    setStep("importing");

    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);
      const payload = batch.map((b) => ({
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        rating: b.rating,
        status: b.status,
        date_finished: b.date_finished,
        publication_year: b.publication_year,
        page_count: b.page_count,
        publisher: b.publisher,
        format: b.format,
        notes: b.notes,
        cover_image_url: b.cover_image_url,
        book_type: b.book_type,
        is_favorite: b.is_favorite,
        is_up_next: b.is_up_next,
      }));

      const { data, error } = await supabase
        .from("books")
        .insert(payload)
        .select("id, title");

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else if (data) {
        inserted += data.length;
        // Link external list items for each inserted book
        for (const book of data) {
          try {
            await linkExternalItemsToBook(book.id, book.title);
          } catch {
            // Non-critical — don't fail the import
          }
        }
      }
      setImportedCount(inserted);
    }

    if (inserted > 0) {
      capture("books_imported", { count: inserted, source: "csv" });
    }
    setImportErrors(errors);
    setStep("summary");
  }

  // --- Render ---

  const totalSelected = getMappedBooks().length;
  const { toImport: dedupedBooks, dupCount } = dedupLoading
    ? { toImport: [], dupCount: 0 }
    : getDedupedBooks();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          Import from Goodreads
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload your Goodreads library export to populate your library.
        </p>
      </div>

      {step === "upload" && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div
              className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-8 py-12 text-center transition-colors hover:border-foreground/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className="h-10 w-10 text-muted-foreground/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="font-medium">Click to select a CSV file</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Export from Goodreads: My Books → Import and export → Export
                  Library
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {parseError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {parseError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h2 className="font-serif text-xl font-bold">
                Select shelves to import
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length.toLocaleString()} books found in your export.
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(shelfCounts)
                .sort(([a], [b]) => {
                  // Pin read, currently-reading, to-read to top
                  const order: Record<string, number> = {
                    read: 0,
                    "currently-reading": 1,
                    "to-read": 2,
                  };
                  return (order[a] ?? 99) - (order[b] ?? 99);
                })
                .map(([shelf, count]) => (
                  <div key={shelf}>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedShelves.has(shelf)}
                        onChange={(e) => {
                          const next = new Set(selectedShelves);
                          if (e.target.checked) next.add(shelf);
                          else next.delete(shelf);
                          setSelectedShelves(next);
                        }}
                        className="h-4 w-4 rounded border-muted-foreground/30"
                      />
                      <span className="font-medium">{shelf}</span>
                      <span className="text-sm text-muted-foreground">
                        ({count.toLocaleString()})
                      </span>
                    </label>

                    {shelf === "to-read" && selectedShelves.has("to-read") && (
                      <div className="ml-7 mt-2 space-y-1">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="toReadStatus"
                            checked={toReadStatus === "unread"}
                            onChange={() => setToReadStatus("unread")}
                          />
                          Import as Unread
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="toReadStatus"
                            checked={toReadStatus === "wishlist"}
                            onChange={() => setToReadStatus("wishlist")}
                          />
                          Import as Wishlist
                        </label>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              {dedupLoading ? (
                <span className="text-muted-foreground">
                  Checking for duplicates...
                </span>
              ) : (
                <>
                  <span className="font-medium">
                    {totalSelected.toLocaleString()} books selected
                  </span>
                  {dupCount > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {dupCount.toLocaleString()} already in library (will be
                      skipped)
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    · {dedupedBooks.length.toLocaleString()} to import
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={startImport}
                disabled={dedupLoading || dedupedBooks.length === 0}
                className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                Import {dedupedBooks.length.toLocaleString()} books
              </button>
              <button
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setShelfCounts({});
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Start over
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h2 className="font-serif text-xl font-bold">Importing...</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Importing {importedCount.toLocaleString()} of{" "}
                {totalToImport.toLocaleString()} books...
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all duration-300"
                style={{
                  width: `${totalToImport > 0 ? (importedCount / totalToImport) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === "summary" && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h2 className="font-serif text-xl font-bold">Import complete</h2>
              <p className="mt-2 text-muted-foreground">
                Successfully imported{" "}
                <span className="font-medium text-foreground">
                  {importedCount.toLocaleString()}
                </span>{" "}
                books.
                {skippedCount > 0 && (
                  <>
                    {" "}
                    {skippedCount.toLocaleString()} duplicates skipped.
                  </>
                )}
              </p>
            </div>

            {importErrors.length > 0 && (
              <div>
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  className="text-sm text-destructive hover:underline"
                >
                  {importErrors.length} error
                  {importErrors.length > 1 ? "s" : ""} occurred{" "}
                  {showErrors ? "▾" : "▸"}
                </button>
                {showErrors && (
                  <div className="mt-2 space-y-1 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {importErrors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              {fromOnboarding ? (
                <Link
                  to="/onboarding?imported=true"
                  className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Continue setup →
                </Link>
              ) : (
                <>
                  <Link
                    to="/library"
                    className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    Go to Library →
                  </Link>
                  <Link
                    to="/add"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Add another book →
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
