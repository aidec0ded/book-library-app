import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { Send, Square } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { COMPANION_MONTHLY_REPLIES } from "@/lib/plans";

// Companion's cap is generous, so it's only mentioned near the end of the month's replies
const SHOW_CAP_REMAINING = 10;

interface ChatComposerProps {
  input: string;
  setInput: (text: string) => void;
  send: () => void;
  stop: () => void;
  streaming: boolean;
  waitingForReply: boolean;
  messageLimitReached: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
}

/** Where the reader writes, or what their plan's limit is once they've reached it. */
export function ChatComposer({
  input,
  setInput,
  send,
  stop,
  streaming,
  waitingForReply,
  messageLimitReached,
  textareaRef,
  compact,
}: ChatComposerProps) {
  const { isPaid, chatMessagesUsed, chatMessagesLimit, chatMessagesCap } = useSubscription();

  const freeLimit = !isPaid ? chatMessagesLimit : null;
  const freeLimitReached = messageLimitReached || (freeLimit !== null && chatMessagesUsed >= freeLimit);
  const capRemaining = isPaid && chatMessagesCap !== null ? Math.max(0, chatMessagesCap - chatMessagesUsed) : null;
  const note = compact ? "text-xs" : "text-sm";

  // Shown in place of the box, so nobody writes a message that can't be sent
  if (freeLimitReached || capRemaining === 0) {
    return (
      <div className={`text-center ${compact ? "py-2" : "py-3"}`}>
        {capRemaining === 0 ? (
          <p className={`${note} text-muted-foreground`}>
            You've had {chatMessagesCap} replies from your companion this month, the most for one month.
            It'll be ready to talk again on the 1st.
          </p>
        ) : (
          <>
            <p className={`${note} text-muted-foreground`}>
              You've used all {freeLimit ?? "your"} free replies this month.
            </p>
            <Link
              to="/pricing"
              className="mt-1.5 inline-block text-sm font-medium text-accent hover:underline"
            >
              Get {COMPANION_MONTHLY_REPLIES} replies a month with Companion →
            </Link>
          </>
        )}
      </div>
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = input.trim().length > 0 && !streaming && !waitingForReply;

  return (
    <>
      {freeLimit !== null && (
        <p className={`text-center text-xs text-muted-foreground ${compact ? "mb-1.5" : "mb-2"}`}>
          {chatMessagesUsed} of {freeLimit} free replies used this month
        </p>
      )}
      {capRemaining !== null && capRemaining <= SHOW_CAP_REMAINING && (
        <p className={`text-center text-xs text-muted-foreground ${compact ? "mb-1.5" : "mb-2"}`}>
          {capRemaining} {capRemaining === 1 ? "reply" : "replies"} left this month
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
          rows={compact ? 1 : 2}
          aria-label="Message"
          // 16px on phones: smaller text makes iPhones zoom in when the box is tapped
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none ring-ring focus-visible:ring-2 sm:text-sm"
        />
        {streaming ? (
          <button
            onClick={stop}
            aria-label="Stop the reply"
            title="Stop"
            className={`flex shrink-0 items-center justify-center rounded-lg border bg-background text-foreground transition-colors hover:bg-muted ${
              compact ? "h-9 w-9" : "h-10 w-10"
            }`}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={() => send()}
            disabled={!canSend}
            aria-label="Send"
            className={`flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 ${
              compact ? "h-9 w-9" : "h-10 w-10"
            }`}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  );
}
