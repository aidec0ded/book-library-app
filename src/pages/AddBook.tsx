import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Plus, AlertTriangle, ArrowLeft, Bookmark } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchBooks,
  lookupBook,
  looksLikeISBN,
  normalizeISBN,
  mapToBookInsert,
  groupEditions,
  detectBookType,
} from "@/lib/isbndb";
import type { ISBNdbBook } from "@/lib/isbndb";
import type { BookType } from "@/lib/types";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 20;

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export function AddBook() {
  const navigate = useNavigate();

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ISBNdbBook[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultPage, setResultPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Preview state
  const [selected, setSelected] = useState<ISBNdbBook | null>(null);
  const [view, setView] = useState<"search" | "preview">("search");
  const [status, setStatus] = useState("unread");
  const [previewImgBroken, setPreviewImgBroken] = useState(false);
  const [duplicate, setDuplicate] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [bookType, setBookType] = useState<BookType>("fiction");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleSearch(page = 1) {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      if (looksLikeISBN(trimmed)) {
        const book = await lookupBook(normalizeISBN(trimmed));
        if (book) {
          await selectBook(book);
          return;
        }
        setResults([]);
        setResultTotal(0);
        setSearchError("No book found for that ISBN.");
      } else {
        // Parallel: general search + author-column search
        const [general, byAuthor] = await Promise.all([
          searchBooks(trimmed, page, PAGE_SIZE),
          searchBooks(trimmed, page, PAGE_SIZE, "author").catch(
            () => ({ total: 0, books: [] as ISBNdbBook[] }),
          ),
        ]);

        // Merge: author-search results first, then general results minus dupes
        const seen = new Set<string>();
        const merged: ISBNdbBook[] = [];
        for (const book of [...byAuthor.books, ...general.books]) {
          const key = book.isbn13 || book.isbn || `${book.title}|${book.authors?.[0] ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(book);
          }
        }

        setResults(merged);
        setResultTotal(general.total);
        setResultPage(page);
      }
    } catch {
      setSearchError("Search failed. Check your connection and API key.");
    } finally {
      setSearching(false);
    }
  }

  async function selectBook(book: ISBNdbBook) {
    setSelected(book);
    setView("preview");
    setStatus("unread");
    setBookType(detectBookType(book.subjects));
    setAddError(null);
    setDuplicate(null);
    setPreviewImgBroken(false);

    // Check for duplicate by ISBN
    const isbn = book.isbn13 || book.isbn;
    if (isbn) {
      const { data } = await supabase
        .from("books")
        .select("id, title")
        .eq("isbn", isbn)
        .maybeSingle();
      if (data) {
        setDuplicate(data);
      }
    }
  }

  function backToResults() {
    setView("search");
    setSelected(null);
    setDuplicate(null);
    setAddError(null);
  }

  async function handleAdd(statusOverride?: string) {
    if (!selected) return;
    setAdding(true);
    setAddError(null);

    const payload = mapToBookInsert(selected, statusOverride ?? status);
    // Override book_type with user selection (may differ from auto-detect)
    payload.book_type = bookType;
    const { data, error } = await supabase
      .from("books")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setAddError(error.message);
      setAdding(false);
      return;
    }

    navigate(`/books/${data.id}`);
  }

  const groupedResults = useMemo(
    () => groupEditions(results, query),
    [results, query],
  );

  const totalPages = Math.ceil(resultTotal / PAGE_SIZE);

  // --- Preview view ---
  if (view === "preview" && selected) {
    const isbn = selected.isbn13 || selected.isbn;
    const author = selected.authors?.join(", ") ?? "Unknown";
    const synopsis = selected.synopsis
      ? selected.synopsis.replace(/<[^>]*>/g, "").trim()
      : "";
    const overview = selected.overview
      ? selected.overview.replace(/<[^>]*>/g, "").trim()
      : "";
    const summaryText = synopsis || overview;

    let publicationYear: string | null = null;
    if (selected.date_published) {
      const match = selected.date_published.match(/((?:19|20)\d{2})/);
      if (match) publicationYear = match[1];
    }

    return (
      <div className="space-y-6">
        <button
          onClick={backToResults}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </button>

        {/* Duplicate warning */}
        {duplicate && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                A book with this ISBN is already in your library
              </p>
              <Link
                to={`/books/${duplicate.id}`}
                className="text-yellow-700 underline hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100"
              >
                View &ldquo;{duplicate.title}&rdquo;
              </Link>
            </div>
          </div>
        )}

        {/* Hero area */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {selected.image && !previewImgBroken && (
            <div className="shrink-0 self-center sm:self-start">
              <img
                src={selected.image}
                alt={`Cover of ${selected.title}`}
                className="h-auto w-48 rounded-lg shadow-md sm:w-40"
                loading="lazy"
                onError={() => setPreviewImgBroken(true)}
                onLoad={(e) => {
                  if (e.currentTarget.naturalWidth === 0) setPreviewImgBroken(true);
                }}
              />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight">
                {selected.title}
              </h1>
              <p className="mt-1 text-muted-foreground">{author}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Metadata card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {selected.publisher && (
                <Section label="Publisher">
                  {selected.publisher.trim()}
                </Section>
              )}
              {publicationYear && (
                <Section label="Published">{publicationYear}</Section>
              )}
              {selected.pages && selected.pages > 0 && (
                <Section label="Pages">
                  {selected.pages.toLocaleString()}
                </Section>
              )}
              {selected.binding && (
                <Section label="Format">{selected.binding.trim()}</Section>
              )}
              {isbn && <Section label="ISBN">{isbn}</Section>}
            </dl>
          </CardContent>
        </Card>

        {/* Synopsis */}
        {summaryText && (
          <>
            <Separator />
            <div>
              <h2 className="mb-2 font-semibold">Synopsis</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {summaryText}
              </p>
            </div>
          </>
        )}

        <Separator />

        {/* Add controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Type
            </label>
            <Select value={bookType} onValueChange={(v) => setBookType(v as BookType)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fiction">Fiction</SelectItem>
                <SelectItem value="nonfiction">Nonfiction</SelectItem>
                <SelectItem value="poetry">Poetry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="reading">Reading</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="unfinished">Unfinished</SelectItem>
                <SelectItem value="wishlist">Wishlist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={() => void handleAdd()}
            disabled={adding}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add to Library
          </button>

          <button
            onClick={() => void handleAdd("wishlist")}
            disabled={adding}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Bookmark className="h-4 w-4" />
            Wishlist
          </button>
        </div>

        {addError && (
          <p className="text-sm text-destructive">{addError}</p>
        )}
      </div>
    );
  }

  // --- Search view ---
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Add Book</h1>

      <div className="space-y-4">
        <Input
          type="search"
          placeholder="Search by title, author, or ISBN..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch(1);
            }
          }}
        />

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </div>
        )}

        {searchError && (
          <p className="text-sm text-destructive">{searchError}</p>
        )}

        {/* Results list */}
        {groupedResults.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              {groupedResults.length} work{groupedResults.length !== 1 ? "s" : ""}
              {resultTotal > results.length && (
                <span> · {resultTotal.toLocaleString()} editions total</span>
              )}
            </p>
            <div className="divide-y rounded-lg border">
              {groupedResults.map((group) => {
                const book = group.best;
                const author = book.authors?.join(", ") ?? "Unknown";
                let year: string | null = null;
                if (book.date_published) {
                  const match = book.date_published.match(
                    /((?:19|20)\d{2})/,
                  );
                  if (match) year = match[1];
                }
                return (
                  <button
                    key={group.key}
                    onClick={() => void selectBook(book)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    {book.image ? (
                      <img
                        src={book.image}
                        alt=""
                        className="h-16 w-11 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                        No img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{book.title}</p>
                        {group.editions.length > 1 && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {group.editions.length} editions
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {author}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[year, book.publisher?.trim()]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                page={resultPage}
                totalPages={totalPages}
                onPageChange={(p) => void handleSearch(p)}
              />
            )}
          </>
        )}

        {/* Hint before first search */}
        {!searching && !hasSearched && !searchError && (
          <p className="text-sm text-muted-foreground">
            Press Enter to search
          </p>
        )}

        {/* Empty state — only after an actual search returns nothing */}
        {!searching &&
          hasSearched &&
          results.length === 0 &&
          !searchError && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              No books found for that search.
            </div>
          )}
      </div>
    </div>
  );
}
