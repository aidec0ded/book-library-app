import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/BookCover";
import { fetchLists, createList } from "@/lib/lists";
import type { ListWithCount } from "@/lib/types";

export function ListsPage() {
  const [lists, setLists] = useState<ListWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchLists();
        setLists(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lists");
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
      const list = await createList(
        trimmedName,
        newDescription.trim() || null,
      );
      setLists([{ ...list, book_count: 0, cover_book: null }, ...lists]);
      setNewName("");
      setNewDescription("");
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Lists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated collections from your library
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create List
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="List name"
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
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName("");
                  setNewDescription("");
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {lists.length === 0 && !showCreateForm ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No lists yet. Create one to start curating books from your library.
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <Link
              key={list.id}
              to={`/lists/${list.id}`}
              className="flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="w-16 shrink-0">
                {list.cover_book ? (
                  <BookCover
                    title={list.cover_book.title}
                    author={list.cover_book.author}
                    coverUrl={list.cover_book.cover_image_url}
                    size="sm"
                  />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
                    Empty
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base font-semibold">{list.name}</p>
                {list.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {list.description}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {list.book_count} {list.book_count === 1 ? "book" : "books"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
