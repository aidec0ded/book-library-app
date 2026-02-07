import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  fetchVibesForBook,
  fetchAllVibes,
  addVibe,
  removeVibe,
  confirmVibe,
} from "@/lib/vibes";
import {
  CANONICAL_VIBES,
  CANONICAL_VIBE_SET,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes";
import type { BookVibe } from "@/lib/types";

export function VibeEditor({ bookId }: { bookId: string }) {
  const [vibes, setVibes] = useState<BookVibe[]>([]);
  const [allVibes, setAllVibes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    void fetchVibesForBook(bookId).then(setVibes);
    void fetchAllVibes().then(setAllVibes);
  }, [bookId]);

  const canonicalVibes = vibes.filter((v) => v.is_canonical);
  const freeformVibes = vibes.filter((v) => !v.is_canonical);
  const currentVibeNames = vibes.map((v) => v.vibe);
  const activeCanonicalTags = new Set(canonicalVibes.map((v) => v.vibe));

  // Freeform suggestions exclude canonical vibe tags
  const suggestions =
    input.trim().length > 0
      ? allVibes
          .filter(
            (v) =>
              v.includes(input.trim().toLowerCase()) &&
              !currentVibeNames.includes(v) &&
              !CANONICAL_VIBE_SET.has(v),
          )
          .slice(0, 8)
      : [];

  async function handleAddFreeform(raw: string) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized || currentVibeNames.includes(normalized)) {
      setInput("");
      setShowSuggestions(false);
      return;
    }

    // Optimistic: add a temp entry
    const tempId = "temp-" + Date.now();
    const tempVibe: BookVibe = {
      id: tempId,
      book_id: bookId,
      vibe: normalized,
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
        setAllVibes((prev) =>
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

  async function handleToggleCanonical(tag: string) {
    const existing = vibes.find((v) => v.vibe === tag && v.is_canonical);
    if (existing) {
      // Remove it
      setVibes((prev) => prev.filter((v) => v.id !== existing.id));
      try {
        await removeVibe(existing.id);
      } catch {
        setVibes((prev) => [...prev, existing]);
      }
    } else {
      // Add it
      const tempId = "temp-" + Date.now();
      const tempVibe: BookVibe = {
        id: tempId,
        book_id: bookId,
        vibe: tag,
        ai_assigned: false,
        user_confirmed: true,
        is_canonical: true,
        created_at: new Date().toISOString(),
      };
      setVibes((prev) => [...prev, tempVibe]);
      try {
        const saved = await addVibe(bookId, tag, true);
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

  return (
    <div className="space-y-4">
      {/* Canonical vibes */}
      <div className="space-y-2">
        <h2 className="font-semibold">Vibes</h2>
        <div className="flex flex-wrap gap-2">
          {CANONICAL_VIBES.map((cv) => {
            const isActive = activeCanonicalTags.has(cv.tag);
            const existing = canonicalVibes.find((v) => v.vibe === cv.tag);
            const isUnconfirmedAi =
              existing?.ai_assigned && !existing?.user_confirmed;

            return (
              <Badge
                key={cv.tag}
                variant={isActive ? "default" : "outline"}
                className={`cursor-pointer gap-1 transition-opacity ${
                  isActive ? "" : "opacity-50 hover:opacity-80"
                }`}
                title={cv.description}
                onClick={() => void handleToggleCanonical(cv.tag)}
              >
                {isUnconfirmedAi && <Sparkles className="h-3 w-3" />}
                {formatCanonicalVibe(cv.tag)}
                {isUnconfirmedAi && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleConfirm(existing!);
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

      {/* Custom tags */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Tags
        </h3>

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
          <p className="text-sm text-muted-foreground">
            No tags yet
          </p>
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
