import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/BookCover";
import { fetchSyllabi, createSyllabus } from "@/lib/lists";
import type { ListWithCount } from "@/lib/types";

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Updated ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  const months = Math.floor(days / 30);
  return `Updated ${months} ${months === 1 ? "month" : "months"} ago`;
}

export function SyllabiPage() {
  const [syllabi, setSyllabi] = useState<ListWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchSyllabi();
        setSyllabi(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load syllabi");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleCreate() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    setCreating(true);
    try {
      const list = await createSyllabus(
        trimmedName,
        newDescription.trim() || null,
      );
      setSyllabi([{ ...list, book_count: 0, cover_book: null, cover_books: [] }, ...syllabi]);
      setNewName("");
      setNewDescription("");
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create syllabus");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Course Catalog
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Curated reading lists for deeper exploration. Each syllabus is an
            editorial collection designed to illuminate a theme.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Create Syllabus
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="mb-4 font-serif text-lg font-semibold">New Syllabus</h3>
          <div className="space-y-3">
            <Input
              placeholder="Syllabus name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) handleCreate();
                if (e.key === "Escape") setShowCreateForm(false);
              }}
            />
            <Textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowCreateForm(false);
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName("");
                  setNewDescription("");
                }}
                className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Syllabi list */}
      {syllabi.length === 0 && !showCreateForm ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          No syllabi yet. Create one to start curating books around a theme.
        </div>
      ) : (
        <div className="space-y-0">
          {syllabi.map((s, idx) => (
            <div key={s.id}>
              <Link
                to={`/syllabi/${s.id}`}
                className="group relative flex flex-col gap-5 rounded-xl p-6 -mx-6 transition-all hover:bg-card sm:flex-row sm:items-start"
              >
                {/* Cover thumbnail */}
                <div className="shrink-0">
                  {s.cover_book ? (
                    <div className="h-32 w-24 overflow-hidden rounded-lg shadow-md transition-transform duration-500 group-hover:scale-105 sm:h-40 sm:w-32">
                      <BookCover
                        title={s.cover_book.title}
                        author={s.cover_book.author}
                        coverUrl={s.cover_book.cover_image_url}
                        size="lg"
                      />
                    </div>
                  ) : (
                    <div className="flex h-32 w-24 items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground shadow-md sm:h-40 sm:w-32">
                      Empty
                    </div>
                  )}
                </div>

                {/* Text content */}
                <div className="flex flex-1 flex-col">
                  <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="text-accent">
                      {s.book_count} {s.book_count === 1 ? "Book" : "Books"}
                    </span>
                    <span>&middot;</span>
                    <span>{relativeDate(s.updated_at)}</span>
                  </div>
                  <h3 className="mb-2 font-serif text-2xl font-bold transition-colors group-hover:text-accent">
                    {s.name}
                  </h3>
                  {s.description && (
                    <p className="text-base leading-relaxed text-muted-foreground line-clamp-3">
                      {s.description}
                    </p>
                  )}
                </div>
              </Link>
              {idx < syllabi.length - 1 && <hr className="mx-0 border-border" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
