import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/BookCover";
import { fetchSyllabi, createSyllabus } from "@/lib/lists";
import { useChatContext } from "@/contexts/ChatContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import type { ListWithCount } from "@/lib/types";

type FilterTab = "all" | "syllabus" | "reading_path";

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
  const [allLists, setAllLists] = useState<ListWithCount[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const { openPanel } = useChatContext();
  const { isPaid } = useSubscription();

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchSyllabi();
        setAllLists(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered =
    activeTab === "all"
      ? allLists
      : allLists.filter((s) => s.list_type === activeTab);

  const hasPaths = allLists.some((s) => s.list_type === "reading_path");
  const hasSyllabi = allLists.some((s) => s.list_type === "syllabus");

  async function handleCreate() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    setCreating(true);
    try {
      const list = await createSyllabus(
        trimmedName,
        newDescription.trim() || null,
      );
      setAllLists([{ ...list, book_count: 0, cover_book: null, cover_books: [] }, ...allLists]);
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
            Curated reading lists and structured intellectual journeys. Syllabi
            illuminate a theme; reading paths guide you through one.
          </p>
        </div>
        {isPaid && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Create Syllabus
          </button>
        )}
        {!isPaid && (
          <Link
            to="/pricing"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-5 py-2.5 text-sm font-medium text-accent transition-all hover:bg-accent/10"
          >
            <Lock className="h-3.5 w-3.5" />
            Upgrade to Create
          </Link>
        )}
      </div>

      {/* Filter tabs — only show when both types exist */}
      {hasPaths && hasSyllabi && (
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "syllabus", label: "Syllabi" },
              { key: "reading_path", label: "Reading Paths" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create form */}
      {isPaid && showCreateForm && (
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

      {/* List */}
      {filtered.length === 0 && !showCreateForm ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          {activeTab === "reading_path" ? (
            <div className="space-y-3">
              <p>No reading paths yet.</p>
              <button
                onClick={() => openPanel()}
                className="inline-flex items-center gap-2 text-accent hover:text-accent/80"
              >
                <MessageSquare className="h-4 w-4" />
                Create one through the AI companion
              </button>
            </div>
          ) : (
            "No syllabi yet. Create one to start curating books around a theme."
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {filtered.map((s, idx) => (
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
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="text-accent">
                      {s.book_count} {s.book_count === 1 ? "Book" : "Books"}
                    </span>
                    <span>&middot;</span>
                    <span>{relativeDate(s.updated_at)}</span>
                    {s.list_type === "reading_path" && (
                      <>
                        <span>&middot;</span>
                        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-600 normal-case tracking-normal dark:text-violet-400">
                          Reading Path
                        </span>
                      </>
                    )}
                    {s.list_type === "syllabus" && s.ai_generated && (
                      <>
                        <span>&middot;</span>
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent normal-case tracking-normal">
                          Rekollekt Generated
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="mb-2 font-serif text-2xl font-bold transition-colors group-hover:text-accent">
                    {s.name}
                  </h3>
                  {/* Thesis for reading paths */}
                  {s.list_type === "reading_path" && s.thesis && (
                    <p className="mb-2 font-serif text-base italic leading-relaxed text-muted-foreground line-clamp-2">
                      {s.thesis}
                    </p>
                  )}
                  {s.description && (
                    <p className="text-base leading-relaxed text-muted-foreground line-clamp-3">
                      {s.description}
                    </p>
                  )}
                  {/* Progress bar for reading paths */}
                  {s.list_type === "reading_path" && s.progress && s.book_count > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{
                            width: `${(s.progress.completed / s.book_count) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {s.progress.completed} of {s.book_count} completed
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              {idx < filtered.length - 1 && <hr className="mx-0 border-border" />}
            </div>
          ))}
        </div>
      )}

      {/* Hint for creating reading paths */}
      {activeTab !== "reading_path" && !hasPaths && allLists.length > 0 && (
        <div className="rounded-xl border border-dashed px-6 py-6 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            Want a deeper, structured exploration? Reading paths guide you through a theme with seminar-style scaffolding.
          </p>
          <button
            onClick={() => openPanel()}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80"
          >
            <MessageSquare className="h-4 w-4" />
            Create a reading path through the AI companion
          </button>
        </div>
      )}
    </div>
  );
}
