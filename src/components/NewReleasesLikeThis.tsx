import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";
import { addReleaseToWishlist, fetchReleasesLikeBook } from "@/lib/releases";
import { capture } from "@/lib/posthog";
import type { NewRelease } from "@/lib/types";

const MAX_SHOWN = 6;

function monthLabel(release: NewRelease): string {
  if (!release.pub_year || !release.pub_month) return "";
  return new Date(release.pub_year, release.pub_month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Notable new releases closest to this book, by embedding (no AI call). Opening one
 * shows its synopsis with "Want to Read", so it can go on the wishlist from here.
 */
export function NewReleasesLikeThis({ bookId }: { bookId: string }) {
  const [releases, setReleases] = useState<NewRelease[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOpenId(null);
    fetchReleasesLikeBook(bookId, MAX_SHOWN)
      .then((found) => {
        if (!cancelled) setReleases(found);
      })
      .catch(() => {
        if (!cancelled) setReleases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (releases.length === 0) return null;
  const open = releases.find((r) => r.id === openId) ?? null;

  async function wantToRead(release: NewRelease) {
    setAdding(release.id);
    try {
      await addReleaseToWishlist(release);
      capture("release_wishlisted", { from: "book_page" });
      setAdded((prev) => new Set(prev).add(release.id));
    } catch (err) {
      console.error("Error adding to wishlist:", err);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="font-semibold">New releases like this</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Notable books out recently or coming soon that are closest to this one.</p>
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {releases.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            aria-expanded={openId === r.id}
            className={`group min-w-0 text-left ${openId && openId !== r.id ? "opacity-60" : ""}`}
          >
            <BookCover
              title={r.title}
              author={r.authors.join(", ") || "Unknown"}
              coverUrl={r.cover_image_url}
              size="sm"
              className="shadow-sm transition-shadow group-hover:shadow-md"
            />
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug group-hover:underline">{r.title}</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.authors.join(", ")}</p>
            <p className="text-xs text-muted-foreground">{monthLabel(r)}</p>
          </button>
        ))}
      </div>

      {open && (
        <div className="mt-4 rounded-md border p-4">
          <p className="font-serif text-lg font-semibold leading-snug">{open.title}</p>
          <p className="text-sm text-muted-foreground">
            {[open.authors.join(", "), open.publisher, monthLabel(open)].filter(Boolean).join(" · ")}
          </p>
          {open.synopsis && <p className="mt-2 line-clamp-6 text-sm leading-relaxed">{open.synopsis}</p>}
          {open.ai_rationale && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Why it might suit you: </span>
              {open.ai_rationale}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {added.has(open.id) ? (
              <span className="rounded-md border bg-muted px-3 py-1.5 text-xs text-muted-foreground">On your wishlist</span>
            ) : (
              <button
                type="button"
                onClick={() => void wantToRead(open)}
                disabled={adding === open.id}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {adding === open.id ? "Adding..." : "Want to Read"}
              </button>
            )}
            {open.pub_year && open.pub_month && (
              <Link
                to={`/releases?year=${open.pub_year}&month=${open.pub_month}`}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                More from {monthLabel(open)}
              </Link>
            )}
            {open.isbn13 && (
              <a
                href={`https://bookshop.org/books?keywords=${open.isbn13}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Bookshop.org
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
