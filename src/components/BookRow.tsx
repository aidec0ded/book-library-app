import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { formatCanonicalVibe } from "@/lib/canonical-vibes";
import type { BookSummary } from "@/lib/types";

const statusVariant = (status: string | null) => {
  switch (status) {
    case "read":
      return "secondary" as const;
    case "reading":
      return "default" as const;
    case "unfinished":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

function formatRating(rating: number | null): string {
  if (rating === null) return "";
  return "\u2605 " + rating.toFixed(1);
}

export function BookRow({
  book,
  vibes,
}: {
  book: BookSummary;
  vibes?: string[];
}) {
  const navigate = useNavigate();
  const [imgBroken, setImgBroken] = useState(false);

  return (
    <button
      onClick={() => navigate(`/books/${book.id}`)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
    >
      {book.cover_image_url && !imgBroken ? (
        <img
          src={book.cover_image_url}
          alt=""
          className="h-12 w-8 shrink-0 rounded object-cover"
          loading="lazy"
          onError={() => setImgBroken(true)}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth === 0) setImgBroken(true);
          }}
        />
      ) : (
        <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif font-medium">{book.title}</div>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-muted-foreground">
            {book.author}
          </span>
          {vibes && vibes.length > 0 && (
            <span className="hidden shrink-0 items-center gap-1 sm:flex">
              {vibes.slice(0, 3).map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="px-1.5 py-0 text-[10px]"
                >
                  {formatCanonicalVibe(v)}
                </Badge>
              ))}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {book.rating !== null && book.rating > 0 && (
          <span className="text-sm">{formatRating(book.rating)}</span>
        )}
        {book.status && (
          <Badge variant={statusVariant(book.status)}>{book.status}</Badge>
        )}
      </div>
    </button>
  );
}
