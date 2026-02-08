import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShelfFilterBuilder } from "@/components/ShelfFilterBuilder";
import { ShelfCarousel } from "@/components/ShelfCarousel";
import { fetchShelves, createShelf } from "@/lib/shelves";
import type { Shelf, ShelfFilter, ShelfType, ShelfWithCover } from "@/lib/types";

// ── Cover fan positions ──
// 3 covers: left (-6deg), center (0deg), right (+6deg)
const FAN_TRANSFORMS = [
  { base: "rotate(-6deg) translateX(-35%)", hover: "translateZ(20px) rotate(-8deg) translateX(-45%)" },
  { base: "rotate(0deg) translateY(0)", hover: "translateZ(40px) rotate(2deg) translateY(-5px)" },
  { base: "rotate(6deg) translateX(35%)", hover: "translateZ(60px) rotate(8deg) translateX(45%)" },
] as const;

function CoverStack({
  books,
  hovered,
}: {
  books: { cover_image_url: string | null; title: string }[];
  hovered: boolean;
}) {
  if (books.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-sm text-muted-foreground">Empty</span>
      </div>
    );
  }

  return (
    <>
      {books.slice(0, 3).map((book, i) => {
        const t = FAN_TRANSFORMS[i];
        const zIndex = i === 1 ? 20 : 10;
        const shadow = i === 1 ? "shadow-2xl" : "shadow-xl";
        return (
          <div
            key={i}
            className={`absolute h-[55%] aspect-[2/3] rounded bg-cover bg-center ${shadow} border border-white/10`}
            style={{
              zIndex,
              transform: hovered ? t.hover : t.base,
              transition: "transform 300ms ease, box-shadow 300ms ease",
              backgroundImage: book.cover_image_url
                ? `url(${book.cover_image_url})`
                : undefined,
              backgroundColor: book.cover_image_url ? undefined : "var(--secondary)",
            }}
          >
            {!book.cover_image_url && (
              <div className="flex h-full w-full items-center justify-center px-2 text-center">
                <span className="font-serif text-xs font-bold leading-tight line-clamp-3">
                  {book.title}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function ShelvesView() {
  const [shelves, setShelves] = useState<ShelfWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const loadShelves = useCallback(async () => {
    try {
      const data = await fetchShelves();
      setShelves(data);
    } catch (err) {
      console.error("Error fetching shelves:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShelves();
  }, [loadShelves]);

  function handleShelfClose() {
    setSelectedShelf(null);
    void loadShelves();
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
          My Shelves
        </h1>
        <p className="mt-2 font-serif text-lg italic text-muted-foreground">
          {shelves.length} curated {shelves.length === 1 ? "collection" : "collections"}
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowCreateForm((o) => !o)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-sans text-sm font-bold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Plus className="h-4 w-4" />
            Create New Shelf
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mx-auto mb-10 max-w-lg">
          <CreateShelfForm
            onCreated={() => {
              setShowCreateForm(false);
              void loadShelves();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* Empty state */}
      {shelves.length === 0 && !showCreateForm && (
        <div className="rounded-xl border-2 border-dashed px-8 py-16 text-center">
          <p className="font-serif text-xl font-bold">No shelves yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create one to start organizing your library.
          </p>
        </div>
      )}

      {/* Gallery grid */}
      <div className="grid grid-cols-2 gap-8 sm:gap-10 lg:grid-cols-3 xl:grid-cols-4">
        {shelves.map((shelf) => (
          <button
            key={shelf.id}
            onClick={() => setSelectedShelf(shelf)}
            onMouseEnter={() => setHoveredId(shelf.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="group text-left"
          >
            {/* Cover stack area */}
            <div
              className="relative mb-4 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-secondary shadow-sm transition-shadow group-hover:shadow-md"
              style={{ perspective: "1000px" }}
            >
              <CoverStack
                books={shelf.cover_books}
                hovered={hoveredId === shelf.id}
              />
            </div>
            {/* Label */}
            <div className="text-center">
              <h3 className="font-serif text-lg font-bold leading-tight transition-colors group-hover:text-accent sm:text-xl">
                {shelf.name}
              </h3>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {shelf.book_count} {shelf.book_count === 1 ? "Book" : "Books"}
                </span>
                {shelf.shelf_type === "auto" && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    auto
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Carousel overlay */}
      {selectedShelf && (
        <ShelfCarousel shelf={selectedShelf} onClose={handleShelfClose} />
      )}
    </div>
  );
}

function CreateShelfForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shelfType, setShelfType] = useState<ShelfType>("manual");
  const [filter, setFilter] = useState<ShelfFilter>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await createShelf(
        trimmed,
        description.trim() || null,
        shelfType,
        shelfType === "auto" ? filter : null,
      );
      onCreated();
    } catch (err) {
      console.error("Error creating shelf:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border p-4"
    >
      <Input
        placeholder="Shelf name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />

      {/* Type toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Type:</span>
        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => setShelfType("manual")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              shelfType === "manual"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setShelfType("auto")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              shelfType === "auto"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Auto
          </button>
        </div>
      </div>

      {/* Filter builder for auto shelves */}
      {shelfType === "auto" && (
        <ShelfFilterBuilder filter={filter} onChange={setFilter} />
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Shelf"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
