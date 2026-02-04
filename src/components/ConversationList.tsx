import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import type { Conversation } from "@/lib/types";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  loading: boolean;
}

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

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  loading,
}: ConversationListProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Conversations
          {conversations.length > 0 && (
            <span className="text-xs">({conversations.length})</span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={onNewChat}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New Chat
        </button>
      </div>

      {open && (
        <div className="max-h-48 overflow-y-auto px-2 pb-2">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </div>
          )}
          {!loading && conversations.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                conv.id === activeId
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <span className="min-w-0 truncate">
                {conv.title ?? "Untitled"}
              </span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                {formatRelativeDate(conv.started_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
