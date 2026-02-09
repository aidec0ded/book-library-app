import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";
import { DonutChart } from "@/components/DonutChart";
import { formatRating } from "@/lib/books";
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

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Render *accent* markers as accent-colored spans */
function renderAccentGreeting(text: string): React.ReactNode[] {
  return text.split(/\*(.+?)\*/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="text-accent not-italic">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function Home() {
  const [greeting, setGreeting] = useState("");
  const [greetingLoaded, setGreetingLoaded] = useState(false);
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
    void fetchGreeting().then((g) => {
      setGreeting(g);
      setGreetingLoaded(true);
    });
  }, []);

  if (loading) {
    return (
      <div className="text-muted-foreground">Loading...</div>
    );
  }

  const currentBook = currentlyReading[currentIndex];

  return (
    <div className="-mx-4 -mt-6">
      {/* ── Hero Section (full-bleed) ── */}
      <section className="relative w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] px-6 sm:px-10 lg:px-14 xl:px-20 pb-10 pt-8 lg:pb-14 lg:pt-12">
        {currentlyReading.length > 0 && currentBook ? (
          <>
            {/* Mobile: cover-first layout */}
            <div className="flex flex-col items-center gap-8 lg:hidden">
              {/* Cover */}
              <div className="relative w-48 sm:w-56">
                <div className="absolute -inset-4 rounded-2xl bg-accent/15 blur-2xl" />
                <Link to={`/books/${currentBook.id}`} className="relative block">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-white/5 shadow-2xl">
                    {currentBook.cover_image_url ? (
                      <img
                        src={currentBook.cover_image_url}
                        alt={`Cover of ${currentBook.title}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-secondary px-4 text-center">
                        <span className="font-serif text-sm font-bold leading-tight line-clamp-3">
                          {currentBook.title}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              </div>

              {/* Greeting + book info */}
              <div className="text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {getTimeOfDayGreeting()}
                </span>
                {!greetingLoaded ? (
                  <div className="mx-auto mt-4 max-w-md space-y-2">
                    <div className="mx-auto h-7 w-4/5 animate-pulse rounded bg-muted/50" />
                    <div className="mx-auto h-7 w-3/5 animate-pulse rounded bg-muted/50" />
                  </div>
                ) : greeting ? (
                  <p className="mx-auto mt-4 max-w-md font-serif text-2xl font-medium italic leading-snug animate-in fade-in duration-500">
                    {renderAccentGreeting(greeting)}
                  </p>
                ) : null}
                <div className="mt-6">
                  <Link to={`/books/${currentBook.id}`} className="group">
                    <h2 className="font-serif text-xl font-bold tracking-tight group-hover:text-accent transition-colors">
                      {currentBook.title}
                    </h2>
                  </Link>
                  <p className="mt-1 font-serif italic text-muted-foreground">
                    by {currentBook.author}
                  </p>
                </div>
                <div className="mt-5 flex items-center justify-center gap-4">
                  <Link
                    to={`/books/${currentBook.id}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-accent-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    Dive Deeper
                    <span className="text-xs">→</span>
                  </Link>
                </div>
                {currentlyReading.length > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-1.5">
                    {currentlyReading.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIndex(i)}
                        className={`h-2 rounded-full transition-all ${
                          i === currentIndex
                            ? "w-6 bg-accent"
                            : "w-2 bg-border hover:bg-muted-foreground"
                        }`}
                        aria-label={`Go to book ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Desktop: 7/5 grid — greeting left, cover + info right */}
            <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-12 lg:items-start">
              {/* Left: greeting only */}
              <div className="lg:col-span-7">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {getTimeOfDayGreeting()}
                </span>
                {!greetingLoaded ? (
                  <div className="mt-4 space-y-3">
                    <div className="h-10 w-4/5 animate-pulse rounded-lg bg-muted/50 xl:h-12" />
                    <div className="h-10 w-3/5 animate-pulse rounded-lg bg-muted/50 xl:h-12" />
                  </div>
                ) : (
                  <h1 className="mt-4 font-serif text-4xl font-medium italic leading-[1.2] tracking-tight xl:text-5xl animate-in fade-in duration-500">
                    {renderAccentGreeting(greeting || "Welcome back.")}
                  </h1>
                )}
              </div>

              {/* Right: cover + book info + CTA */}
              <div className="lg:col-span-5 flex flex-col items-end">
                <div className="relative w-64 xl:w-72">
                  <div className="absolute -inset-6 rounded-3xl bg-accent/15 blur-3xl" />
                  <Link to={`/books/${currentBook.id}`} className="relative block group">
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/5 shadow-2xl transition-transform duration-500 group-hover:-translate-y-1">
                      {currentBook.cover_image_url ? (
                        <img
                          src={currentBook.cover_image_url}
                          alt={`Cover of ${currentBook.title}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-secondary px-6 text-center">
                          <span className="font-serif text-lg font-bold leading-tight line-clamp-3">
                            {currentBook.title}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                </div>
                <div className="mt-6 w-64 xl:w-72">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Currently Reading
                  </p>
                  <Link to={`/books/${currentBook.id}`} className="group mt-1 block">
                    <h2 className="font-serif text-xl font-bold tracking-tight transition-colors group-hover:text-accent xl:text-2xl">
                      {currentBook.title}
                    </h2>
                  </Link>
                  <p className="mt-0.5 font-serif italic text-muted-foreground">
                    by {currentBook.author}
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    <Link
                      to={`/books/${currentBook.id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-accent-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                    >
                      Dive Deeper
                      <span className="text-xs">→</span>
                    </Link>
                    {currentlyReading.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        {currentlyReading.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={`h-2 rounded-full transition-all ${
                              i === currentIndex
                                ? "w-6 bg-accent"
                                : "w-2 bg-border hover:bg-muted-foreground"
                            }`}
                            aria-label={`Go to book ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* No currently reading — greeting only */
          <div className="py-8 text-center lg:py-12 lg:text-left">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {getTimeOfDayGreeting()}
            </span>
            {!greetingLoaded ? (
              <div className="mx-auto mt-4 max-w-2xl space-y-3 lg:mx-0">
                <div className="h-10 w-4/5 animate-pulse rounded-lg bg-muted/50 sm:h-12" />
                <div className="h-10 w-3/5 animate-pulse rounded-lg bg-muted/50 sm:h-12" />
              </div>
            ) : (
              <h1 className="mx-auto mt-4 max-w-2xl font-serif text-3xl font-medium italic leading-snug tracking-tight sm:text-4xl lg:mx-0 lg:text-4xl xl:text-5xl animate-in fade-in duration-500">
                {renderAccentGreeting(greeting || "Welcome back.")}
              </h1>
            )}
            <div className="mt-8">
              <Link
                to="/library?status=unread"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-accent-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                Pick something to read
                <span className="text-xs">→</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── Content Sections (full-bleed) ── */}
      <div className="relative w-screen ml-[calc(-50vw+50%)] lg:w-[calc(100vw-15rem)] lg:ml-[calc(-50vw+50%+7.5rem)] space-y-16 px-6 pb-16 sm:px-10 lg:px-14 xl:px-20">
        {/* Picked for You */}
        {suggestions.length > 0 && (
          <section>
            <div className="flex items-end justify-between border-b pb-4">
              <h2 className="font-serif text-3xl font-bold tracking-tight">
                Picked for You
              </h2>
              <Link
                to="/recommendations"
                className="group flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-foreground"
              >
                See all
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5 md:gap-8">
              {suggestions.map((book) => (
                <Link
                  key={book.id}
                  to={`/books/${book.id}`}
                  className="group flex flex-col gap-4"
                >
                  <div className="relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-xl">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.cover_image_url}
                      size="sm"
                    />
                  </div>
                  <div>
                    <p className="font-serif text-base font-bold leading-tight transition-colors group-hover:text-accent line-clamp-2 lg:text-lg">
                      {book.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                      {book.author}
                    </p>
                    {book.predicted_rating != null && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="text-accent text-xs">★</span>
                        <span className="text-xs font-bold text-accent">
                          {formatRating(book.predicted_rating)} predicted
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {suggestions.length === 0 && stats && stats.totalBooks === 0 && (
          <section>
            <div className="border-b pb-4">
              <h2 className="font-serif text-3xl font-bold tracking-tight">
                Picked for You
              </h2>
            </div>
            <div className="mt-8 rounded-xl border-2 border-dashed px-8 py-12 text-center">
              <p className="font-serif text-lg font-bold">No suggestions yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add some books to get personalized recommendations.
              </p>
              <Link
                to="/add"
                className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
              >
                Add a book →
              </Link>
            </div>
          </section>
        )}

        {/* Recently Added */}
        {recentAdditions.length > 0 && (
          <section>
            <div className="border-b pb-4">
              <h2 className="font-serif text-3xl font-bold tracking-tight">
                Recently Added
              </h2>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {recentAdditions.map((book) => (
                <Link
                  key={book.id}
                  to={`/books/${book.id}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="overflow-hidden rounded-lg shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.cover_image_url}
                      size="sm"
                    />
                  </div>
                  <div className="px-0.5">
                    <p className="font-serif text-base font-bold leading-tight transition-colors group-hover:text-accent line-clamp-2">
                      {book.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {book.author}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Your Reading DNA */}
        {stats && stats.totalBooks > 0 && (
          <section>
            <div className="border-b pb-4">
              <h2 className="font-serif text-3xl font-bold tracking-tight">
                Your Reading DNA
              </h2>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-0 overflow-hidden rounded-xl border bg-card md:grid-cols-4">
              {/* Read percentage */}
              <div className="flex flex-col items-center justify-center gap-3 border-b border-r p-6 md:border-b-0">
                <DonutChart percent={stats.readPercent} size={112} strokeWidth={8} />
                <p className="text-center text-sm text-muted-foreground">
                  {stats.readBooks} of {stats.totalBooks} read
                </p>
              </div>

              {/* Top author */}
              {stats.topAuthor && (
                <div className="flex flex-col items-center justify-center gap-2 border-b p-6 md:border-b-0 md:border-r">
                  <p className="font-serif text-5xl font-bold text-accent md:text-6xl">{stats.topAuthor.count}</p>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Top Author
                  </p>
                  <p className="font-serif text-lg font-bold">
                    {stats.topAuthor.name}
                  </p>
                </div>
              )}

              {/* Top vibe */}
              {stats.topVibe && (
                <div className="flex flex-col items-center justify-center gap-2 border-r p-6">
                  <p className="font-serif text-5xl font-bold text-accent md:text-6xl">{stats.topVibe.count}</p>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Top Vibe
                  </p>
                  <p className="font-serif text-lg font-bold capitalize">
                    {stats.topVibe.name}
                  </p>
                </div>
              )}

              {/* Total books */}
              <div className="flex flex-col items-center justify-center gap-2 p-6">
                <p className="font-serif text-5xl font-bold text-accent md:text-6xl">
                  {stats.totalBooks.toLocaleString()}
                </p>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Total Books
                </p>
                <p className="font-serif text-lg font-bold">
                  In Library
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
