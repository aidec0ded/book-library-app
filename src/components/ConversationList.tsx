import { useState, type ComponentProps } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { ConversationItems } from "@/components/ConversationItems";

interface ConversationListProps extends ComponentProps<typeof ConversationItems> {
  onNewChat: () => void;
}

export function ConversationList({ onNewChat, ...items }: ConversationListProps) {
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
          {items.conversations.length > 0 && (
            <span className="text-xs">({items.conversations.length})</span>
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
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          <ConversationItems {...items} />
        </div>
      )}
    </div>
  );
}
