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

function SeasonalCard({ book }: { book: BookSummary }) {
  const navigate = useNavigate();
  const [imgBroken, setImgBroken] = useState(false);

  return (
    <button
      onClick={() => navigate(`/books/${book.id}`)}
      className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
    >
      {book.cover_image_url && !imgBroken ? (
        <img
          src={book.cover_image_url}
          alt=""
          className="h-16 w-11 shrink-0 rounded object-cover"
          loading="lazy"
          onError={() => setImgBroken(true)}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth === 0) setImgBroken(true);
          }}
        />
      ) : (
        <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif font-medium">{book.title}</div>
        <div className="truncate text-sm text-muted-foreground">
          {book.author}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {book.rating !== null && book.rating > 0 && (
            <span>{formatRating(book.rating)}</span>
          )}
          {book.timing_raw && <span>{book.timing_raw}</span>}
        </div>
      </div>
    </button>
  );
}

export function SeasonalRecommendations() {
  const { month, position } = getCurrentTiming();
  const [allMatches, setAllMatches] = useState<BookSummary[]>([]);
  const [picks, setPicks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMatches() {
      setLoading(true);
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, status, rating, timing_raw, cover_image_url")
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
          <h2 className="font-serif text-xl font-semibold">What to Read Now</h2>
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
          <SeasonalCard key={book.id} book={book} />
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
