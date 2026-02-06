import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDistinctGenres } from "@/lib/filters";
import {
  CANONICAL_VIBES,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import { MONTH_NAMES } from "@/lib/timing";
import type { ShelfFilter } from "@/lib/types";

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "5", label: "5 stars" },
  { value: "4.5", label: "4.5+" },
  { value: "4", label: "4+" },
  { value: "3", label: "3+" },
];

interface ShelfFilterBuilderProps {
  filter: ShelfFilter;
  onChange: (filter: ShelfFilter) => void;
}

export function ShelfFilterBuilder({
  filter,
  onChange,
}: ShelfFilterBuilderProps) {
  const [genres, setGenres] = useState<string[]>([]);

  useEffect(() => {
    void fetchDistinctGenres().then(setGenres);
  }, []);

  function update(patch: Partial<ShelfFilter>) {
    onChange({ ...filter, ...patch });
  }

  function toggleVibe(tag: string) {
    const current = filter.vibes ?? [];
    const next = current.includes(tag)
      ? current.filter((v) => v !== tag)
      : [...current, tag];
    update({ vibes: next.length > 0 ? next : undefined });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {/* Status */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={filter.status ?? "any"}
            onValueChange={(v) =>
              update({ status: v === "any" ? undefined : v })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="reading">Reading</SelectItem>
              <SelectItem value="unfinished">Unfinished</SelectItem>
              <SelectItem value="wishlist">Wishlist</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Genre */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Genre
          </label>
          <Select
            value={filter.genre ?? "any"}
            onValueChange={(v) =>
              update({ genre: v === "any" ? undefined : v })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rating */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Min Rating
          </label>
          <Select
            value={filter.rating_min != null ? String(filter.rating_min) : "any"}
            onValueChange={(v) =>
              update({ rating_min: v === "any" ? undefined : Number(v) })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Month */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Month
          </label>
          <Select
            value={
              filter.timing_month != null ? String(filter.timing_month) : "any"
            }
            onValueChange={(v) =>
              update({ timing_month: v === "any" ? undefined : Number(v) })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Range filters */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Pages
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              placeholder="Min"
              className="h-8 w-20"
              value={filter.page_count_min ?? ""}
              onChange={(e) =>
                update({
                  page_count_min: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
            <span className="text-xs text-muted-foreground">&ndash;</span>
            <Input
              type="number"
              placeholder="Max"
              className="h-8 w-20"
              value={filter.page_count_max ?? ""}
              onChange={(e) =>
                update({
                  page_count_max: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Year
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              placeholder="Min"
              className="h-8 w-20"
              value={filter.pub_year_min ?? ""}
              onChange={(e) =>
                update({
                  pub_year_min: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
            <span className="text-xs text-muted-foreground">&ndash;</span>
            <Input
              type="number"
              placeholder="Max"
              className="h-8 w-20"
              value={filter.pub_year_max ?? ""}
              onChange={(e) =>
                update({
                  pub_year_max: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filter.is_favorite ?? false}
            onChange={(e) =>
              update({ is_favorite: e.target.checked || undefined })
            }
            className="rounded"
          />
          <span className="text-muted-foreground">Favorites only</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filter.is_up_next ?? false}
            onChange={(e) =>
              update({ is_up_next: e.target.checked || undefined })
            }
            className="rounded"
          />
          <span className="text-muted-foreground">Up Next only</span>
        </label>
      </div>

      {/* Vibes */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Vibes</span>
        <div className="flex flex-wrap gap-1.5">
          {CANONICAL_VIBES.map((cv) => {
            const isActive = (filter.vibes ?? []).includes(cv.tag);
            return (
              <Badge
                key={cv.tag}
                variant={isActive ? "default" : "outline"}
                className={`cursor-pointer transition-opacity ${
                  isActive ? "" : "opacity-60 hover:opacity-90"
                }`}
                title={cv.description}
                onClick={() => toggleVibe(cv.tag)}
              >
                {formatCanonicalVibe(cv.tag)}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
