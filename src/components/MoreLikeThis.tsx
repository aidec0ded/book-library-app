import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";
import { fetchSimilarBooks, formatRating, type SimilarBook } from "@/lib/books";

const MAX_SHOWN = 8;

const NOT_STARTED = new Set(["unread", "wishlist"]);

interface MoreLikeThisProps {
  book: { id: string; title: string; author: string; status: string | null };
}

/**
 * The reader's own books closest to this one. For a book they haven't started: the ones
 * they've read, with their ratings, which is what its predicted rating leans on. For one
 * they've started or read: what's still waiting on their shelf.
 */
export function MoreLikeThis({ book }: MoreLikeThisProps) {
  const notStarted = book.status === null || NOT_STARTED.has(book.status);
  const [books, setBooks] = useState<SimilarBook[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSimilarBooks(book, notStarted ? ["read", "unfinished"] : ["unread", "wishlist"], MAX_SHOWN)
      .then((found) => {
        if (!cancelled) setBooks(found);
      })
      .catch(() => {
        if (!cancelled) setBooks([]);
      });
    return () => {
      cancelled = true;
    };
    // The status decides which side of the shelf to look on
  }, [book.id, book.title, book.author, notStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  if (books.length === 0) return null;

  const label = (b: SimilarBook) => {
    if (notStarted) return b.rating ? `★ ${formatRating(b.rating)}` : b.status === "unfinished" ? "Unfinished" : "Read";
    if (b.status === "wishlist") return "Wishlist";
    return b.predicted_rating ? `Predicted ★ ${formatRating(b.predicted_rating)}` : "Unread";
  };

  return (
    <div>
      <div className="mb-3">
        <h2 className="font-semibold">{notStarted ? "Like books you've read" : "More like this on your shelf"}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {notStarted
            ? "The books you've read closest to this one, with how you rated them."
            : "Unread and wishlist books closest to this one."}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {books.map((b) => (
          <Link key={b.id} to={`/books/${b.id}`} className="group min-w-0">
            <BookCover
              title={b.title}
              author={b.author}
              coverUrl={b.cover_image_url}
              size="sm"
              className="shadow-sm transition-shadow group-hover:shadow-md"
            />
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug group-hover:underline">{b.title}</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{b.author}</p>
            <p className="text-xs text-muted-foreground">{label(b)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
