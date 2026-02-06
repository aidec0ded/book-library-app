import { useState, useCallback } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Build a window of page numbers to display.
 * Always shows first, last, and pages around current, with "..." gaps.
 * e.g. [1, "...", 4, 5, 6, "...", 20]
 */
function buildPageWindow(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | "...")[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[i]);
  }

  return result;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState("");
  const [showJump, setShowJump] = useState(false);

  const handleJump = useCallback(() => {
    const num = parseInt(jumpValue, 10);
    if (num >= 1 && num <= totalPages) {
      onPageChange(num);
    }
    setJumpValue("");
    setShowJump(false);
  }, [jumpValue, totalPages, onPageChange]);

  const window = buildPageWindow(page, totalPages);

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Previous
      </button>

      <div className="flex items-center gap-1">
        {window.map((item, i) =>
          item === "..." ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={`min-w-[2rem] rounded-md px-2 py-1 text-sm ${
                item === page
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {item}
            </button>
          ),
        )}

        {totalPages > 7 && (
          <>
            {showJump ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleJump();
                }}
                className="ml-2 flex items-center gap-1"
              >
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  onBlur={() => {
                    if (!jumpValue) setShowJump(false);
                  }}
                  placeholder="#"
                  autoFocus
                  className="w-14 rounded-md border px-2 py-1 text-sm text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="submit"
                  className="rounded-md border px-2 py-1 text-sm hover:bg-muted"
                >
                  Go
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowJump(true)}
                className="ml-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                title="Jump to page"
              >
                Go to...
              </button>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}
