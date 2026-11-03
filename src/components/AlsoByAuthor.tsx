import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";
import { authorLibraryPath, fetchBooksByAuthor, formatRating, type AuthorBook } from "@/lib/books";

const MAX_SHOWN = 8;

/** What to pick up next comes first: anything in progress, then unread, then the rest. */
const STATUS_ORDER: Record<string, number> = { reading: 0, unread: 1, wishlist: 2 };

function sortForBrowsing(books: AuthorBook[]): AuthorBook[] {
  const score = (book: AuthorBook) => book.rating ?? book.predicted_rating ?? 0;
  return [...books].sort(
    (a, b) =>
      (STATUS_ORDER[a.status ?? "unread"] ?? 3) - (STATUS_ORDER[b.status ?? "unread"] ?? 3) ||
      score(b) - score(a) ||
      a.title.localeCompare(b.title),
  );
}

function bookLabel(book: AuthorBook): string {
  if (book.rating) return `★ ${formatRating(book.rating)}`;
  const status = book.status ?? "unread";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function AlsoByAuthor({ bookId, author }: { bookId: string; author: string }) {
  const [books, setBooks] = useState<AuthorBook[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchBooksByAuthor(author)
      .then((found) => {
        if (!cancelled) setBooks(sortForBrowsing(found.filter((b) => b.id !== bookId)));
      })
      .catch(() => {
        if (!cancelled) setBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [author, bookId]);

  if (books.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">Also by {author}</h2>
        {books.length > MAX_SHOWN && (
          <Link
            to={authorLibraryPath(author)}
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            See all {books.length + 1}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {books.slice(0, MAX_SHOWN).map((book) => (
          <Link key={book.id} to={`/books/${book.id}`} className="group min-w-0">
            <BookCover
              title={book.title}
              author={book.author}
              coverUrl={book.cover_image_url}
              size="sm"
              className="shadow-sm transition-shadow group-hover:shadow-md"
            />
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug group-hover:underline">
              {book.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{bookLabel(book)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
