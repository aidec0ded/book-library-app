import { useState, useRef, useCallback } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

const TOTAL_STARS = 5;
const PRECISION = 0.25;

function roundToPrecision(value: number): number {
  return Math.round(value / PRECISION) * PRECISION;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayRating = hoverRating ?? value ?? 0;

  const calculateRating = useCallback(
    (clientX: number): number => {
      const container = containerRef.current;
      if (!container) return 0;
      const { left, width } = container.getBoundingClientRect();
      const percent = (clientX - left) / width;
      const raw = percent * TOTAL_STARS;
      return clamp(roundToPrecision(raw), PRECISION, TOTAL_STARS);
    },
    [],
  );

  function handleMouseMove(e: React.MouseEvent) {
    if (disabled) return;
    setHoverRating(calculateRating(e.clientX));
  }

  function handleMouseLeave() {
    setHoverRating(null);
  }

  function handleClick(e: React.MouseEvent) {
    if (disabled) return;
    const rating = calculateRating(e.clientX);
    // Click same rating to clear
    if (rating === value) {
      onChange(null);
    } else {
      onChange(rating);
    }
  }

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className={`inline-flex ${disabled ? "opacity-50" : "cursor-pointer"}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="slider"
        aria-label="Rating"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value ?? 0}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          const current = value ?? 0;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = clamp(current + PRECISION, PRECISION, TOTAL_STARS);
            onChange(next);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = current - PRECISION;
            onChange(next < PRECISION ? null : next);
          }
        }}
      >
        {Array.from({ length: TOTAL_STARS }, (_, i) => {
          const starIndex = i + 1;
          const fill = clamp(displayRating - i, 0, 1);

          return (
            <div key={i} className="relative h-6 w-6">
              {/* Empty star (background) */}
              <Star
                className="absolute inset-0 h-6 w-6 text-border"
                strokeWidth={1.5}
              />
              {/* Filled portion */}
              {fill > 0 && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star
                    className="h-6 w-6 fill-accent text-accent"
                    strokeWidth={1.5}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {hoverRating != null
          ? formatLabel(hoverRating)
          : value != null
            ? formatLabel(value)
            : "Unrated"}
      </p>
    </div>
  );
}

function formatLabel(rating: number): string {
  if (rating % 0.5 === 0) return rating.toFixed(1);
  return rating.toFixed(2);
}
