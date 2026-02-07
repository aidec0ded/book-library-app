import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchVibesForBook,
  fetchAllVibes,
  addVibe,
  removeVibe,
  confirmVibe,
} from "@/lib/vibes";
import {
  fetchCanonicalTags,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import type { BookVibe, BookType, TagCategory, CanonicalTag } from "@/lib/types";

interface CategoryConfig {
  category: TagCategory;
  label: string;
  mode: "multi" | "single";
}

const TYPE_CATEGORIES: Record<BookType, CategoryConfig[]> = {
  fiction: [{ category: "vibe", label: "Vibes", mode: "multi" }],
  nonfiction: [
    { category: "topic", label: "Topics", mode: "multi" },
    { category: "form", label: "Form", mode: "single" },
    { category: "depth", label: "Depth", mode: "single" },
  ],
  poetry: [
    { category: "movement", label: "Movement", mode: "multi" },
    { category: "formal_feel", label: "Formal Feel", mode: "multi" },
    { category: "accessibility", label: "Accessibility", mode: "single" },
  ],
};

export function VibeEditor({
  bookId,
  bookType,
}: {
  bookId: string;
  bookType: BookType;
}) {
  const [vibes, setVibes] = useState<BookVibe[]>([]);
  const [canonicalTags, setCanonicalTags] = useState<CanonicalTag[]>([]);
  const [allFreeformVibes, setAllFreeformVibes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const categories = TYPE_CATEGORIES[bookType];

  // Fetch canonical tags for this book type's categories
  useEffect(() => {
    Promise.all(categories.map((c) => fetchCanonicalTags(c.category)))
      .then((results) => setCanonicalTags(results.flat()))
      .catch(() => setCanonicalTags([]));
  }, [bookType]);

  // Fetch existing vibes and freeform autocomplete pool
  useEffect(() => {
    void fetchVibesForBook(bookId).then(setVibes);
    void fetchAllVibes().then(setAllFreeformVibes);
  }, [bookId]);

  // Set of all canonical tag names (for filtering freeform suggestions)
  const canonicalTagSet = useMemo(
    () => new Set(canonicalTags.map((t) => t.tag)),
    [canonicalTags],
  );

  // Group canonical tags by category
  const tagsByCategory = useMemo(() => {
    const map = new Map<TagCategory, CanonicalTag[]>();
    for (const t of canonicalTags) {
      if (!map.has(t.tag_category)) map.set(t.tag_category, []);
      map.get(t.tag_category)!.push(t);
    }
    return map;
  }, [canonicalTags]);

  // Freeform vibes (non-canonical tags)
  const freeformVibes = vibes.filter((v) => !v.is_canonical);
  const currentVibeNames = vibes.map((v) => v.vibe);

  // Freeform autocomplete suggestions
  const suggestions =
    input.trim().length > 0
      ? allFreeformVibes
          .filter(
            (v) =>
              v.includes(input.trim().toLowerCase()) &&
              !currentVibeNames.includes(v) &&
              !canonicalTagSet.has(v),
          )
          .slice(0, 8)
      : [];

  // --- Handlers ---

  async function handleToggleCanonical(tag: string, tagCategory: TagCategory) {
    const existing = vibes.find(
      (v) => v.vibe === tag && v.tag_category === tagCategory && v.is_canonical,
    );
    if (existing) {
      setVibes((prev) => prev.filter((v) => v.id !== existing.id));
      try {
        await removeVibe(existing.id);
      } catch {
        setVibes((prev) => [...prev, existing]);
      }
    } else {
      const tempId = "temp-" + Date.now();
      const tempVibe: BookVibe = {
        id: tempId,
        book_id: bookId,
        vibe: tag,
        tag_category: tagCategory,
        ai_assigned: false,
        user_confirmed: true,
        is_canonical: true,
        created_at: new Date().toISOString(),
      };
      setVibes((prev) => [...prev, tempVibe]);
      try {
        const saved = await addVibe(bookId, tag, true, tagCategory);
        if (saved) {
          setVibes((prev) => prev.map((v) => (v.id === tempId ? saved : v)));
        } else {
          setVibes((prev) => prev.filter((v) => v.id !== tempId));
        }
      } catch {
        setVibes((prev) => prev.filter((v) => v.id !== tempId));
      }
    }
  }

  async function handleSingleSelect(
    tagCategory: TagCategory,
    newTag: string | null,
  ) {
    const existing = vibes.filter(
      (v) => v.tag_category === tagCategory && v.is_canonical,
    );
    const prevVibes = [...vibes];

    // Optimistic: remove old, add new
    setVibes((prev) =>
      prev.filter((v) => !(v.tag_category === tagCategory && v.is_canonical)),
    );

    let tempId: string | null = null;
    if (newTag) {
      tempId = "temp-" + Date.now();
      setVibes((prev) => [
        ...prev,
        {
          id: tempId!,
          book_id: bookId,
          vibe: newTag,
          tag_category: tagCategory,
          ai_assigned: false,
          user_confirmed: true,
          is_canonical: true,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    try {
      for (const v of existing) {
        await removeVibe(v.id);
      }
      if (newTag) {
        const saved = await addVibe(bookId, newTag, true, tagCategory);
        if (saved && tempId) {
          setVibes((prev) =>
            prev.map((v) => (v.id === tempId ? saved : v)),
          );
        }
      }
    } catch {
      setVibes(prevVibes);
    }
  }

  async function handleConfirm(vibe: BookVibe) {
    setVibes((prev) =>
      prev.map((v) =>
        v.id === vibe.id ? { ...v, user_confirmed: true } : v,
      ),
    );
    try {
      await confirmVibe(vibe.id);
    } catch {
      setVibes((prev) =>
        prev.map((v) =>
          v.id === vibe.id ? { ...v, user_confirmed: false } : v,
        ),
      );
    }
  }

  async function handleRemove(vibe: BookVibe) {
    setVibes((prev) => prev.filter((v) => v.id !== vibe.id));
    try {
      await removeVibe(vibe.id);
    } catch {
      setVibes((prev) => [...prev, vibe]);
    }
  }

  async function handleAddFreeform(raw: string) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized || currentVibeNames.includes(normalized)) {
      setInput("");
      setShowSuggestions(false);
      return;
    }

    const tempId = "temp-" + Date.now();
    const tempVibe: BookVibe = {
      id: tempId,
      book_id: bookId,
      vibe: normalized,
      tag_category: "vibe",
      ai_assigned: false,
      user_confirmed: true,
      is_canonical: false,
      created_at: new Date().toISOString(),
    };
    setVibes((prev) => [...prev, tempVibe]);
    setInput("");
    setShowSuggestions(false);

    try {
      const saved = await addVibe(bookId, normalized, false);
      if (saved) {
        setVibes((prev) => prev.map((v) => (v.id === tempId ? saved : v)));
        setAllFreeformVibes((prev) =>
          prev.includes(normalized)
            ? prev
            : [...prev, normalized].sort(),
        );
      } else {
        setVibes((prev) => prev.filter((v) => v.id !== tempId));
      }
    } catch {
      setVibes((prev) => prev.filter((v) => v.id !== tempId));
    }
  }

  // --- Render ---

  return (
    <div className="space-y-4">
      {/* Type-specific canonical sections */}
      {categories.map((config) => {
        const tags = tagsByCategory.get(config.category) ?? [];
        const existing = vibes.filter(
          (v) => v.tag_category === config.category && v.is_canonical,
        );
        const activeTags = new Set(existing.map((v) => v.vibe));

        if (config.mode === "multi") {
          return (
            <div key={config.category} className="space-y-2">
              <h2 className="font-semibold">{config.label}</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((ct) => {
                  const isActive = activeTags.has(ct.tag);
                  const existingVibe = existing.find(
                    (v) => v.vibe === ct.tag,
                  );
                  const isUnconfirmedAi =
                    existingVibe?.ai_assigned && !existingVibe?.user_confirmed;

                  return (
                    <Badge
                      key={ct.tag}
                      variant={isActive ? "default" : "outline"}
                      className={`cursor-pointer gap-1 transition-opacity ${
                        isActive ? "" : "opacity-50 hover:opacity-80"
                      }`}
                      title={ct.description}
                      onClick={() =>
                        void handleToggleCanonical(ct.tag, config.category)
                      }
                    >
                      {isUnconfirmedAi && <Sparkles className="h-3 w-3" />}
                      {formatCanonicalVibe(ct.tag)}
                      {isUnconfirmedAi && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleConfirm(existingVibe!);
                          }}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          );
        }

        // Single-select dropdown
        const currentValue =
          existing.find((v) => v.is_canonical)?.vibe ?? "";
        const unconfirmedAi = existing.find(
          (v) => v.ai_assigned && !v.user_confirmed,
        );

        return (
          <div key={config.category} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{config.label}</h2>
              {unconfirmedAi && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  AI-suggested
                  <button
                    type="button"
                    onClick={() => void handleConfirm(unconfirmedAi)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <Select
              value={currentValue || undefined}
              onValueChange={(val) =>
                void handleSingleSelect(
                  config.category,
                  val === "__none__" ? null : val,
                )
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue
                  placeholder={`Select ${config.label.toLowerCase()}...`}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {tags.map((ct) => (
                  <SelectItem key={ct.tag} value={ct.tag}>
                    {formatCanonicalVibe(ct.tag)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}

      {/* Freeform tags */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Tags</h3>

        {freeformVibes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {freeformVibes.map((vibe) => {
              const isUnconfirmedAi =
                vibe.ai_assigned && !vibe.user_confirmed;

              return (
                <Badge
                  key={vibe.id}
                  variant={isUnconfirmedAi ? "outline" : "secondary"}
                  className="gap-1"
                >
                  {isUnconfirmedAi && <Sparkles className="h-3 w-3" />}
                  {vibe.vibe}
                  {isUnconfirmedAi && (
                    <button
                      type="button"
                      onClick={() => void handleConfirm(vibe)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRemove(vibe)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tags yet</p>
        )}

        <div className="relative max-w-xs">
          <Input
            placeholder="Add a tag..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              blurTimeout.current = setTimeout(
                () => setShowSuggestions(false),
                150,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddFreeform(input);
              }
            }}
          />

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    if (blurTimeout.current) clearTimeout(blurTimeout.current);
                    void handleAddFreeform(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
