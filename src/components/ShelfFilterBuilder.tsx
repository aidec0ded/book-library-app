import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDistinctGenres } from "@/lib/filters";
import { fetchCanonicalTags, formatCanonicalVibe } from "@/lib/canonical-vibes";
import { MONTH_NAMES } from "@/lib/timing";
import type { BookType, CanonicalTag, ShelfFilter, TagCategory } from "@/lib/types";

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "5", label: "5 stars" },
  { value: "4.5", label: "4.5+" },
  { value: "4", label: "4+" },
  { value: "3", label: "3+" },
];

const TYPE_CATEGORIES: Record<BookType, TagCategory[]> = {
  fiction: ["vibe"],
  nonfiction: ["topic", "form", "depth"],
  poetry: ["movement", "formal_feel", "accessibility"],
};

const CATEGORY_LABELS: Record<TagCategory, string> = {
  vibe: "Vibes",
  topic: "Topics",
  form: "Form",
  depth: "Depth",
  movement: "Movement",
  formal_feel: "Feel",
  accessibility: "Access",
};

type TagFilterKey = "vibes" | "topics" | "form" | "depth" | "movement" | "formal_feel" | "accessibility";

const CATEGORY_TO_FILTER_KEY: Record<TagCategory, TagFilterKey> = {
  vibe: "vibes",
  topic: "topics",
  form: "form",
  depth: "depth",
  movement: "movement",
  formal_feel: "formal_feel",
  accessibility: "accessibility",
};

interface ShelfFilterBuilderProps {
  filter: ShelfFilter;
  onChange: (filter: ShelfFilter) => void;
}

export function ShelfFilterBuilder({
  filter,
  onChange,
}: ShelfFilterBuilderProps) {
  const [genres, setGenres] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<CanonicalTag[]>([]);

  useEffect(() => {
    void fetchDistinctGenres().then(setGenres);
    void fetchCanonicalTags().then(setAllTags);
  }, []);

  const tagsByCategory = useMemo(() => {
    const map = new Map<TagCategory, CanonicalTag[]>();
    for (const t of allTags) {
      const arr = map.get(t.tag_category) ?? [];
      arr.push(t);
      map.set(t.tag_category, arr);
    }
    return map;
  }, [allTags]);

  // Categories to show based on selected book_type
  const visibleCategories = filter.book_type
    ? TYPE_CATEGORIES[filter.book_type]
    : [];

  function update(patch: Partial<ShelfFilter>) {
    onChange({ ...filter, ...patch });
  }

  function handleBookTypeChange(value: string) {
    const newType = value === "any" ? undefined : (value as BookType);
    const patch: Partial<ShelfFilter> = { book_type: newType };
    // Clear tag selections from categories not relevant to the new type
    if (newType !== "fiction") patch.vibes = undefined;
    if (newType !== "nonfiction") {
      patch.topics = undefined;
      patch.form = undefined;
      patch.depth = undefined;
    }
    if (newType !== "poetry") {
      patch.movement = undefined;
      patch.formal_feel = undefined;
      patch.accessibility = undefined;
    }
    update(patch);
  }

  function toggleTag(category: TagCategory, tag: string) {
    const key = CATEGORY_TO_FILTER_KEY[category];
    const current = (filter[key] as string[] | undefined) ?? [];
    const next = current.includes(tag)
      ? current.filter((v) => v !== tag)
      : [...current, tag];
    update({ [key]: next.length > 0 ? next : undefined });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {/* Book Type */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <Select
            value={filter.book_type ?? "any"}
            onValueChange={handleBookTypeChange}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="nonfiction">Nonfiction</SelectItem>
              <SelectItem value="poetry">Poetry</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
      </div>

      {/* Type-specific tag sections */}
      {visibleCategories.map((category) => {
        const tags = tagsByCategory.get(category) ?? [];
        if (tags.length === 0) return null;
        const key = CATEGORY_TO_FILTER_KEY[category];
        const selected = (filter[key] as string[] | undefined) ?? [];
        return (
          <div key={category} className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((ct) => {
                const isActive = selected.includes(ct.tag);
                return (
                  <Badge
                    key={ct.tag}
                    variant={isActive ? "default" : "outline"}
                    className={`cursor-pointer transition-opacity ${
                      isActive ? "" : "opacity-60 hover:opacity-90"
                    }`}
                    title={ct.description}
                    onClick={() => toggleTag(category, ct.tag)}
                  >
                    {formatCanonicalVibe(ct.tag)}
                  </Badge>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
