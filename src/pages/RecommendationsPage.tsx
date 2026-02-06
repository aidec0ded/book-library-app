import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";
import { formatRating } from "@/lib/books";
import {
  fetchRecommendations,
  type RecommendedBook,
} from "@/lib/recommendations";

export function RecommendationsPage() {
  const [books, setBooks] = useState<RecommendedBook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchRecommendations(20).then((result) => {
      setBooks(result);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Recommendations</h1>
        <p className="text-sm text-muted-foreground">
          Books from your library, ranked for you
        </p>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : books.length === 0 ? (
        <div className="rounded-lg border px-4 py-8 text-center text-muted-foreground">
          <p>No recommendations yet.</p>
          <p className="mt-1 text-sm">
            Recommendations require predicted ratings — run the prediction
            script to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/books/${book.id}`}
              className="group space-y-2"
            >
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.cover_image_url}
                size="sm"
              />
              <div>
                <p className="font-serif text-sm font-semibold leading-tight group-hover:underline line-clamp-2">
                  {book.title}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {book.author}
                </p>
                {book.predicted_rating != null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {"\u2605"} {formatRating(book.predicted_rating)} predicted
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
