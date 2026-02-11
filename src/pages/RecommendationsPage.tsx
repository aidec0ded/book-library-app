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
    <div className="-mx-4 -mt-6">
      <div className="w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20 pb-16 pt-8 lg:pt-12">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Recommendations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Books from your library, ranked for you
          </p>
        </div>

        {loading ? (
          <div className="mt-8 text-muted-foreground">Loading...</div>
        ) : books.length === 0 ? (
          <div className="mt-8 rounded-xl border-2 border-dashed px-8 py-12 text-center">
            <p className="font-serif text-lg font-bold">
              No recommendations yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add and rate more books to unlock personalized recommendations.
            </p>
            <Link
              to="/library"
              className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
            >
              Go to Library →
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book) => (
              <Link
                key={book.id}
                to={`/books/${book.id}`}
                className="group flex flex-col"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.cover_image_url}
                    size="sm"
                  />
                </div>
                <div className="mt-3">
                  <p className="font-serif text-base font-bold leading-tight transition-colors group-hover:text-accent line-clamp-2">
                    {book.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                    {book.author}
                  </p>
                  {book.predicted_rating != null && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-xs text-accent">★</span>
                      <span className="text-xs font-bold text-accent">
                        {formatRating(book.predicted_rating)} predicted
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
