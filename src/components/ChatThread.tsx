import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import type { UseChatSessionReturn } from "@/hooks/useChatSession";

type ThreadState = Pick<
  UseChatSessionReturn,
  | "conversationId"
  | "book"
  | "messages"
  | "streaming"
  | "streamingContent"
  | "streamingActions"
  | "thinking"
  | "waitingForReply"
  | "error"
  | "canRetry"
  | "failedReply"
  | "retry"
  | "notifyExcerptSaved"
>;

interface ChatThreadProps extends ThreadState {
  compact?: boolean;
  /** Offer "Save to book" under messages (not during onboarding) */
  allowSave?: boolean;
}

/** The messages of a conversation, with the reply being written and anything that went wrong. */
export function ChatThread({
  conversationId,
  book,
  messages,
  streaming,
  streamingContent,
  streamingActions,
  thinking,
  waitingForReply,
  error,
  canRetry,
  failedReply,
  retry,
  notifyExcerptSaved,
  compact,
  allowSave = true,
}: ChatThreadProps) {
  return (
    <>
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          role={msg.role}
          content={msg.content}
          actions={msg.actions}
          save={
            !allowSave || msg.id.startsWith("temp-")
              ? undefined
              : { conversationId, book, onSaved: notifyExcerptSaved }
          }
        />
      ))}

      {streaming && (streamingContent || streamingActions.length > 0) && (
        <ChatMessage
          role="assistant"
          content={streamingContent}
          actions={streamingActions}
          isStreaming={Boolean(streamingContent) && !thinking}
        />
      )}

      {streaming && (!streamingContent || thinking) && (
        <div className="flex justify-start">
          <div className="rounded-2xl bg-muted px-4 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}

      {/* What a reply wrote before it failed or the connection dropped */}
      {!streaming && failedReply && <ChatMessage role="assistant" content={failedReply} incomplete />}

      {waitingForReply && (
        <div className={`flex items-center gap-2 text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting for the reply…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive ${
            compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
          }`}
        >
          <AlertCircle className={`mt-0.5 shrink-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          <span className="flex-1">{error}</span>
          {canRetry && (
            <button
              onClick={retry}
              className="flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          )}
        </div>
      )}
    </>
  );
}
