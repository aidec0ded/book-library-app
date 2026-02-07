import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  fetchCanonicalVibesWithCounts,
  fetchBooksByCanonicalVibe,
} from "@/lib/vibes";
import {
  fetchCanonicalTags,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import { BookRow } from "@/components/BookRow";
import { Pagination } from "@/components/Pagination";
import type { BookSummary, BookType, CanonicalTag, TagCategory } from "@/lib/types";

const PAGE_SIZE = 20;

// Which tag categories to display per type tab
const TYPE_CATEGORIES: Record<BookType, { category: TagCategory; label: string }[]> = {
  fiction: [{ category: "vibe", label: "Vibes" }],
  nonfiction: [
    { category: "topic", label: "Topics" },
    { category: "form", label: "Form" },
    { category: "depth", label: "Depth" },
  ],
  poetry: [
    { category: "movement", label: "Movement" },
    { category: "formal_feel", label: "Formal Feel" },
    { category: "accessibility", label: "Accessibility" },
  ],
};

const TYPE_TABS: { value: BookType; label: string }[] = [
  { value: "fiction", label: "Fiction" },
  { value: "nonfiction", label: "Nonfiction" },
  { value: "poetry", label: "Poetry" },
];

const TYPE_SUBTITLES: Record<BookType, string> = {
  fiction: "Browse books by mood and reading experience",
  nonfiction: "Browse by topic, form, and depth",
  poetry: "Browse by movement, feel, and accessibility",
};

export function VibesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTag = searchParams.get("tag");
  const activeTab = (searchParams.get("type") as BookType) || "fiction";
  const page = Number(searchParams.get("page") ?? "1");

  // Grid view state
  const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map());
  const [canonicalTags, setCanonicalTags] = useState<CanonicalTag[]>([]);
  const [gridLoading, setGridLoading] = useState(true);

  // List view state
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [bookCount, setBookCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  // Build description lookup from canonical tags
  const tagDescriptions = useMemo(
    () => new Map(canonicalTags.map((t) => [t.tag, t.description])),
    [canonicalTags],
  );

  // Group canonical tags by category
  const tagsByCategory = useMemo(() => {
    const map = new Map<TagCategory, CanonicalTag[]>();
    for (const t of canonicalTags) {
      const existing = map.get(t.tag_category);
      if (existing) existing.push(t);
      else map.set(t.tag_category, [t]);
    }
    return map;
  }, [canonicalTags]);

  // Fetch canonical tags and counts when tab changes
  useEffect(() => {
    setGridLoading(true);
    const categories = TYPE_CATEGORIES[activeTab];
    const allCats = categories.map((c) => c.category);

    Promise.all([
      // Fetch tag definitions
      Promise.all(allCats.map((cat) => fetchCanonicalTags(cat))).then((r) =>
        r.flat(),
      ),
      // Fetch counts per category
      Promise.all(
        allCats.map((cat) => fetchCanonicalVibesWithCounts(cat)),
      ).then((results) => {
        const map = new Map<string, number>();
        for (const rows of results) {
          for (const r of rows) map.set(r.vibe, r.count);
        }
        return map;
      }),
    ])
      .then(([tags, counts]) => {
        setCanonicalTags(tags);
        setTagCounts(counts);
        setGridLoading(false);
      })
      .catch(() => setGridLoading(false));
  }, [activeTab]);

  // Fetch books for selected tag
  const fetchBooks = useCallback(async () => {
    if (!selectedTag) return;
    setListLoading(true);
    try {
      const result = await fetchBooksByCanonicalVibe(
        selectedTag,
        page,
        PAGE_SIZE,
      );
      setBooks(result.books);
      setBookCount(result.count);
    } catch (err) {
      console.error("Error fetching books by tag:", err);
    }
    setListLoading(false);
  }, [selectedTag, page]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const totalPages = Math.ceil(bookCount / PAGE_SIZE);

  function handleTabChange(tab: BookType) {
    setSearchParams({ type: tab });
  }

  function handleTagClick(tag: string) {
    setSearchParams({ type: activeTab, tag, page: "1" });
  }

  function handlePageChange(newPage: number) {
    if (!selectedTag) return;
    setSearchParams({ type: activeTab, tag: selectedTag, page: String(newPage) });
  }

  // List view — books for a selected tag
  if (selectedTag) {
    const description = tagDescriptions.get(selectedTag);

    return (
      <div className="space-y-4">
        <div>
          <Link
            to={`/discover?type=${activeTab}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to {activeTab}
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-bold">
            {formatCanonicalVibe(selectedTag)}
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
              No books found with this tag.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        )}
      </div>
    );
  }

  // Grid view — tabbed by type
  const categories = TYPE_CATEGORIES[activeTab];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Discover</h1>
        <p className="text-sm text-muted-foreground">
          {TYPE_SUBTITLES[activeTab]}
        </p>
      </div>

      {/* Type tabs */}
      <div className="flex rounded-md border">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-1.5 text-sm transition-colors ${
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {gridLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-6">
          {categories.map(({ category, label }) => {
            const tags = tagsByCategory.get(category) ?? [];
            if (tags.length === 0) return null;

            return (
              <div key={category}>
                {/* Section header — only show if multiple categories */}
                {categories.length > 1 && (
                  <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                    {label}
                  </h2>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {tags.map((ct) => {
                    const count = tagCounts.get(ct.tag) ?? 0;
                    return (
                      <button
                        key={ct.tag}
                        onClick={() => handleTagClick(ct.tag)}
                        className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="font-medium">
                          {formatCanonicalVibe(ct.tag)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {ct.description}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {count} book{count !== 1 ? "s" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
