import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { ConversationList } from "@/components/ConversationList";
import { useChatContext } from "@/contexts/ChatContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function Chat() {
  const {
    conversationId,
    messages,
    conversations,
    conversationsLoading,
    input,
    streaming,
    streamingContent,
    error,
    messageLimitReached,
    setInput,
    send,
    selectConversation,
    newChat,
    closePanel,
  } = useChatContext();
  const { isPaid, chatMessagesUsed, chatMessagesLimit } = useSubscription();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-close panel when navigating to full page
  useEffect(() => {
    closePanel();
  }, [closePanel]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  function handleNewChat() {
    newChat();
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = input.trim().length > 0 && !streaming;

  return (
    <div className="flex h-[calc(100vh-53px)] flex-col lg:h-screen">
      <ConversationList
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNewChat={handleNewChat}
        loading={conversationsLoading}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-muted-foreground">
                What are you reading?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Talk about your books, get recommendations, or explore your
                reading life.
              </p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {streaming && streamingContent && (
            <ChatMessage
              role="assistant"
              content={streamingContent}
              isStreaming
            />
          )}

          {streaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {messageLimitReached ? (
            <div className="py-3 text-center">
              <p className="text-sm text-muted-foreground">
                You've used all {chatMessagesLimit} free messages this month.
              </p>
              <Link
                to="/pricing"
                className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
              >
                Upgrade for unlimited chat →
              </Link>
            </div>
          ) : (
            <>
              {!isPaid && chatMessagesLimit !== null && (
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {chatMessagesUsed} of {chatMessagesLimit} messages used this month
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Say something..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
                />
                <button
                  onClick={() => send()}
                  disabled={!canSend}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
