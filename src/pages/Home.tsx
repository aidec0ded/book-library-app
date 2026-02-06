import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { BookCover } from "@/components/BookCover";
import { DonutChart } from "@/components/DonutChart";
import {
  fetchCurrentlyReading,
  fetchRecentAdditions,
  fetchLibraryStats,
  fetchGreeting,
  type LibraryStats,
} from "@/lib/home";
import { fetchRecommendations } from "@/lib/recommendations";
import type { Book } from "@/lib/types";

type HomeBook = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "cover_image_url"
  | "status"
  | "predicted_rating"
  | "created_at"
>;

export function Home() {
  const [greeting, setGreeting] = useState("");
  const [currentlyReading, setCurrentlyReading] = useState<HomeBook[]>([]);
  const [suggestions, setSuggestions] = useState<HomeBook[]>([]);
  const [recentAdditions, setRecentAdditions] = useState<HomeBook[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [readingResult, suggestionsResult, recentResult, statsResult] =
        await Promise.all([
          fetchCurrentlyReading().catch(() => []),
          fetchRecommendations(5).catch(() => []),
          fetchRecentAdditions().catch(() => []),
          fetchLibraryStats().catch(() => null),
        ]);

      setCurrentlyReading(readingResult);
      setSuggestions(suggestionsResult);
      setRecentAdditions(recentResult);
      setStats(statsResult);
      setLoading(false);
    }

    void load();

    // Greeting fetched separately (may be slower due to AI generation)
    void fetchGreeting().then(setGreeting);
  }, []);

  if (loading) {
    return (
      <div className="text-muted-foreground">Loading...</div>
    );
  }

  const currentBook = currentlyReading[currentIndex];

  return (
    <div className="space-y-10">
      {/* AI Greeting */}
      {greeting && (
        <p className="font-serif text-lg italic text-muted-foreground">
          {greeting}
        </p>
      )}

      {/* Currently Reading */}
      <section>
        <h2 className="font-serif text-xl font-semibold">Currently Reading</h2>
        <div className="mt-3">
          {currentlyReading.length > 0 && currentBook ? (
            <Card>
              <CardContent className="flex gap-5 p-5">
                <Link to={`/books/${currentBook.id}`} className="shrink-0">
                  <BookCover
                    title={currentBook.title}
                    author={currentBook.author}
                    coverUrl={currentBook.cover_image_url}
                    size="lg"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <Link
                    to={`/books/${currentBook.id}`}
                    className="hover:underline"
                  >
                    <h3 className="font-serif text-lg font-bold leading-tight">
                      {currentBook.title}
                    </h3>
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentBook.author}
                  </p>
                  {currentlyReading.length > 1 && (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() =>
                          setCurrentIndex(
                            (currentIndex - 1 + currentlyReading.length) %
                              currentlyReading.length,
                          )
                        }
                        className="rounded-md border px-2 py-1 text-sm hover:bg-muted"
                        aria-label="Previous book"
                      >
                        &larr;
                      </button>
                      <div className="flex gap-1.5">
                        {currentlyReading.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={`h-2 w-2 rounded-full ${
                              i === currentIndex
                                ? "bg-accent"
                                : "bg-border"
                            }`}
                            aria-label={`Go to book ${i + 1}`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setCurrentIndex(
                            (currentIndex + 1) % currentlyReading.length,
                          )
                        }
                        className="rounded-md border px-2 py-1 text-sm hover:bg-muted"
                        aria-label="Next book"
                      >
                        &rarr;
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-muted-foreground">
                  Nothing on your nightstand right now.
                </p>
                <Link
                  to="/library?status=unread"
                  className="mt-2 inline-block text-sm text-accent hover:underline"
                >
                  Pick something new &rarr;
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* AI-Curated Suggestions */}
      {suggestions.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Picked for You</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {suggestions.map((book) => (
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
                      {"\u2605"} {book.predicted_rating.toFixed(1)} predicted
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3">
            <Link
              to="/recommendations"
              className="text-sm text-accent hover:underline"
            >
              See all recommendations &rarr;
            </Link>
          </div>
        </section>
      )}

      {suggestions.length === 0 && stats && stats.totalBooks === 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Picked for You</h2>
          <Card className="mt-3">
            <CardContent className="p-5 text-center">
              <p className="text-muted-foreground">
                Add some books to get personalized suggestions.
              </p>
              <Link
                to="/add"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Add a book &rarr;
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Recently Added */}
      {recentAdditions.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Recently Added</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {recentAdditions.map((book) => (
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
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Library Stats */}
      {stats && stats.totalBooks > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Your Library</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
            {/* Read percentage donut */}
            <Card>
              <CardContent className="flex flex-col items-center p-5">
                <DonutChart percent={stats.readPercent} />
                <p className="mt-2 text-sm text-muted-foreground">
                  {stats.readBooks} of {stats.totalBooks} read
                </p>
              </CardContent>
            </Card>

            {/* Top author */}
            {stats.topAuthor && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-5 text-center">
                  <p className="text-3xl font-bold">{stats.topAuthor.count}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    books by
                  </p>
                  <p className="font-serif text-sm font-semibold">
                    {stats.topAuthor.name}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Top vibe */}
            {stats.topVibe && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-5 text-center">
                  <p className="text-3xl font-bold">{stats.topVibe.count}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    books tagged
                  </p>
                  <p className="font-serif text-sm font-semibold capitalize">
                    {stats.topVibe.name}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Total books */}
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-5 text-center">
                <p className="text-3xl font-bold">{stats.totalBooks}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  in your library
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
