import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatRating } from "@/lib/books";
import { fetchLibraryMatchesForRelease, type ReleaseLibraryMatch } from "@/lib/releases";

/** "Like books you've read": the reader's read books closest to a release, linked, with their ratings. */
export function ReleaseLibraryMatches({ releaseId }: { releaseId: string }) {
  const [books, setBooks] = useState<ReleaseLibraryMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLibraryMatchesForRelease(releaseId)
      .then((found) => {
        if (!cancelled) setBooks(found);
      })
      .catch(() => {
        if (!cancelled) setBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  if (books.length === 0) return null;

  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Like books you've read: </span>
      {books.map((book, i) => (
        <Fragment key={book.id}>
          {i > 0 && ", "}
          <Link to={`/books/${book.id}`} className="italic text-foreground hover:underline">
            {book.title}
          </Link>
          {book.rating ? ` ★${formatRating(book.rating)}` : ""}
        </Fragment>
      ))}
    </p>
  );
}
