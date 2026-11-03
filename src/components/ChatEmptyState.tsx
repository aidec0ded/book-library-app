import { useEffect, useState } from "react";
import { fetchListsForBook } from "@/lib/lists";
import type { ConversationBook } from "@/lib/types";

const MAX_FOCUS_QUESTIONS = 3;

function openersForStatus(status: string | null): string[] {
  switch (status) {
    case "reading":
      return [
        "I'm partway through this. Ask me how it's going.",
        "Something in this is staying with me, and I want to work out why.",
      ];
    case "read":
      return [
        "Help me work out what I thought of this.",
        "How does this connect to other books I've read?",
        "What might I have missed?",
      ];
    case "unfinished":
      return ["Help me work out why I stopped.", "Is this worth going back to?"];
    default:
      return [
        "Should this be next for me?",
        "What should I know going in, without spoilers?",
        "How does this connect to what I've read?",
      ];
  }
}

interface ChatEmptyStateProps {
  book: ConversationBook | null;
  compact?: boolean;
  onSend: (text: string) => void;
}

/** What a new conversation shows, with ways in when it's about a book. */
export function ChatEmptyState({ book, compact, onSend }: ChatEmptyStateProps) {
  const [focusQuestions, setFocusQuestions] = useState<string[]>([]);
  const bookId = book?.id;
  const isReading = book?.status === "reading";

  useEffect(() => {
    setFocusQuestions([]);
    if (!bookId || !isReading) return;
    let current = true;
    fetchListsForBook(bookId)
      .then((entries) => {
        if (!current) return;
        setFocusQuestions(
          entries
            .flatMap((entry) => entry.seminar_content?.focus_questions ?? [])
            .slice(0, MAX_FOCUS_QUESTIONS),
        );
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [bookId, isReading]);

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className={`font-medium text-muted-foreground ${compact ? "text-sm" : "text-lg"}`}>
            What are you reading?
          </p>
          <p className={`mt-1 text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
            Talk about your books, get recommendations, or explore your reading life.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <p className={`text-center font-medium text-muted-foreground ${compact ? "text-sm" : "text-lg"}`}>
        Where would you like to start with <em>{book.title}</em>?
      </p>
      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
        {[...focusQuestions, ...openersForStatus(book.status)].map((opener) => (
          <button
            key={opener}
            onClick={() => onSend(opener)}
            className="rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {opener}
          </button>
        ))}
      </div>
    </div>
  );
}
