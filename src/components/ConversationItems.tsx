import { useState } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Conversation } from "@/lib/types";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ConversationItemsProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  hasMore: boolean;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** A list of conversations to switch between, rename, or delete. */
export function ConversationItems({
  conversations,
  activeId,
  loading,
  hasMore,
  onSelect,
  onLoadMore,
  onRename,
  onDelete,
}: ConversationItemsProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveTitle(id: string) {
    const title = titleDraft.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      setError(null);
      await onRename(id, title);
    } catch {
      setError("Couldn't rename that conversation.");
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(null);
    try {
      setError(null);
      await onDelete(id);
    } catch {
      setError("Couldn't delete that conversation.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>
    );
  }

  if (conversations.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">No conversations yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {error && <p className="px-2 py-1 text-xs text-destructive">{error}</p>}

      {conversations.map((conv) => {
        if (deletingId === conv.id) {
          return (
            <div key={conv.id} className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-2.5">
              <p className="text-sm text-destructive">Delete this conversation?</p>
              <p className="text-xs text-muted-foreground">
                Anything saved from it stays on its book's page. What the companion learned from it
                stays in its memory and your reader profile, since those can't be traced back to one
                conversation.
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-destructive px-3 py-1 text-xs text-white hover:bg-destructive/90"
                  onClick={() => void confirmDelete(conv.id)}
                >
                  Delete
                </button>
                <button
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                  onClick={() => setDeletingId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        }

        if (renamingId === conv.id) {
          return (
            <div key={conv.id} className="flex items-center gap-1 px-1 py-0.5">
              <Input
                autoFocus
                value={titleDraft}
                aria-label="Conversation title"
                className="h-8"
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTitle(conv.id);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setRenamingId(null);
                  }
                }}
              />
              <button
                aria-label="Save title"
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void saveTitle(conv.id)}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label="Cancel renaming"
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setRenamingId(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        }

        return (
          <div
            key={conv.id}
            className={`group flex items-center rounded-md transition-colors ${
              conv.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <button
              onClick={() => onSelect(conv.id)}
              className="min-w-0 flex-1 px-2 py-1.5 text-left text-sm"
            >
              <span className="block truncate">{conv.title ?? "Untitled"}</span>
              <span className="block truncate text-xs opacity-70">
                {conv.book ? `${conv.book.title} · ` : ""}
                {formatRelativeDate(conv.last_message_at)}
              </span>
            </button>
            <div className="flex shrink-0 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <button
                aria-label={`Rename ${conv.title ?? "conversation"}`}
                className="rounded p-1.5 opacity-70 hover:opacity-100"
                onClick={() => {
                  setTitleDraft(conv.title ?? "");
                  setRenamingId(conv.id);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`Delete ${conv.title ?? "conversation"}`}
                className="rounded p-1.5 opacity-70 hover:opacity-100"
                onClick={() => setDeletingId(conv.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Show older conversations
        </button>
      )}
    </div>
  );
}
