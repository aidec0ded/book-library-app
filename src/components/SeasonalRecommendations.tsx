import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getCurrentTiming } from "@/lib/timing";
import { getSeasonalName } from "@/lib/seasonal-names";
import type { BookSummary } from "@/lib/types";

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatRating(rating: number | null): string {
  if (rating === null) return "";
  return "\u2605 " + rating.toFixed(1);
}

export function SeasonalRecommendations() {
  const navigate = useNavigate();
  const { month, position } = getCurrentTiming();
  const [allMatches, setAllMatches] = useState<BookSummary[]>([]);
  const [picks, setPicks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMatches() {
      setLoading(true);
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, status, rating, timing_raw")
        .eq("timing_month", month)
        .or(`timing_position.eq.${position},timing_position.is.null`)
        .order("title", { ascending: true });

      if (error) {
        console.error("Error fetching seasonal books:", error);
        setLoading(false);
        return;
      }

      const matches = data ?? [];
      setAllMatches(matches);
      setPicks(shuffle(matches).slice(0, 5));
      setLoading(false);
    }
    void fetchMatches();
  }, [month, position]);

  const reshuffle = useCallback(() => {
    setPicks(shuffle(allMatches).slice(0, 5));
  }, [allMatches]);

  if (loading) {
    return null;
  }

  if (allMatches.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">What to Read Now</h2>
          <p className="text-sm text-muted-foreground">
            Books for {getSeasonalName(month, position).toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reshuffle}
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            Shuffle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((book) => (
          <button
            key={book.id}
            onClick={() => navigate(`/books/${book.id}`)}
            className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
          >
            <div className="truncate font-medium">{book.title}</div>
            <div className="truncate text-sm text-muted-foreground">
              {book.author}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {book.rating !== null && book.rating > 0 && (
                <span>{formatRating(book.rating)}</span>
              )}
              {book.timing_raw && <span>{book.timing_raw}</span>}
            </div>
          </button>
        ))}
      </div>

      <Link
        to={`/seasonal?month=${month}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        See all {getSeasonalName(month)} books &rarr;
      </Link>
    </section>
  );
}
