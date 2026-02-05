import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/BookCover";
import { ShelfFilterBuilder } from "@/components/ShelfFilterBuilder";
import { ShelfCarousel } from "@/components/ShelfCarousel";
import { fetchShelves, createShelf } from "@/lib/shelves";
import type { Shelf, ShelfFilter, ShelfType, ShelfWithCover } from "@/lib/types";

export function ShelvesView() {
  const [shelves, setShelves] = useState<ShelfWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
    // Refresh shelves in case items were added/removed
    void loadShelves();
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {shelves.length} {shelves.length === 1 ? "shelf" : "shelves"}
        </p>
        <button
          onClick={() => setShowCreateForm((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Shelf
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateShelfForm
          onCreated={() => {
            setShowCreateForm(false);
            void loadShelves();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Shelf cards */}
      {shelves.length === 0 && !showCreateForm && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No shelves yet. Create one to start organizing your library.
        </div>
      )}

      <div className="space-y-2">
        {shelves.map((shelf) => (
          <button
            key={shelf.id}
            onClick={() => setSelectedShelf(shelf)}
            className="flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="w-16 shrink-0">
              {shelf.cover_book ? (
                <BookCover
                  title={shelf.cover_book.title}
                  author={shelf.cover_book.author}
                  coverUrl={shelf.cover_book.cover_image_url}
                  size="sm"
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
                  Empty
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-base font-semibold">{shelf.name}</p>
              {shelf.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {shelf.description}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {shelf.book_count} {shelf.book_count === 1 ? "book" : "books"}
                {shelf.shelf_type === "auto" && " · auto"}
              </p>
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
