import { X } from "lucide-react";
import { formatCanonicalVibe } from "@/lib/canonical-vibes";
import type { CanonicalTag, TagCategory } from "@/lib/types";

interface TagPillBarProps {
  tags: CanonicalTag[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  /** "cloud" = single centered row (fiction). "stacked" = rows per category (nonfiction/poetry). */
  layout: "cloud" | "stacked";
}

const CATEGORY_LABELS: Record<string, string> = {
  vibe: "Vibes",
  topic: "Topics",
  form: "Form",
  depth: "Depth",
  movement: "Movement",
  formal_feel: "Feel",
  accessibility: "Access",
};

function Pill({
  tag,
  selected,
  description,
  onToggle,
}: {
  tag: string;
  selected: boolean;
  description: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={description}
      className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
        selected
          ? "bg-accent text-white shadow-sm hover:bg-accent/90"
          : "border border-border text-muted-foreground hover:border-accent hover:text-accent"
      }`}
    >
      <span>{formatCanonicalVibe(tag)}</span>
      {selected && <X className="h-3.5 w-3.5" />}
    </button>
  );
}

export function TagPillBar({
  tags,
  selectedTags,
  onToggleTag,
  layout,
}: TagPillBarProps) {
  if (tags.length === 0) return null;

  const selectedSet = new Set(selectedTags);

  if (layout === "cloud") {
    return (
      <div className="flex flex-wrap justify-center gap-2.5 max-w-4xl mx-auto">
        {tags.map((t) => (
          <Pill
            key={t.tag}
            tag={t.tag}
            selected={selectedSet.has(t.tag)}
            description={t.description}
            onToggle={() => onToggleTag(t.tag)}
          />
        ))}
      </div>
    );
  }

  // Stacked layout: group by category
  const byCategory = new Map<TagCategory, CanonicalTag[]>();
  for (const t of tags) {
    const existing = byCategory.get(t.tag_category);
    if (existing) existing.push(t);
    else byCategory.set(t.tag_category, [t]);
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {[...byCategory.entries()].map(([category, catTags]) => (
        <div key={category} className="flex items-start gap-5">
          <span className="shrink-0 w-20 pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABELS[category] ?? formatCanonicalVibe(category)}
          </span>
          <div className="flex flex-wrap gap-2">
            {catTags.map((t) => (
              <Pill
                key={t.tag}
                tag={t.tag}
                selected={selectedSet.has(t.tag)}
                description={t.description}
                onToggle={() => onToggleTag(t.tag)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
