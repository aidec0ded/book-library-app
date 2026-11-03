import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { ChatEmptyState } from "@/components/ChatEmptyState";
import { ChatMessage } from "@/components/ChatMessage";
import { ConversationList } from "@/components/ConversationList";
import { useChatContext } from "@/contexts/ChatContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function Chat() {
  const { id: linkedId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    conversationId,
    book,
    messages,
    conversations,
    conversationsLoading,
    hasMoreConversations,
    input,
    streaming,
    streamingContent,
    thinking,
    error,
    messageLimitReached,
    setInput,
    send,
    selectConversation,
    newChat,
    loadMoreConversations,
    renameConversation,
    deleteConversation,
    notifyExcerptSaved,
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

  // The link decides which conversation opens
  useEffect(() => {
    if (linkedId) selectConversation(linkedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId]);

  // And follows along once a new conversation has an ID
  useEffect(() => {
    if (conversationId && conversationId !== linkedId) {
      navigate(`/chat/${conversationId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function handleNewChat(nextBook: typeof book = null) {
    newChat(nextBook);
    navigate("/chat");
    textareaRef.current?.focus();
  }

  async function handleDelete(id: string) {
    await deleteConversation(id);
    if (id === linkedId) navigate("/chat");
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
        onSelect={(id) => navigate(`/chat/${id}`)}
        onNewChat={() => handleNewChat()}
        loading={conversationsLoading}
        hasMore={hasMoreConversations}
        onLoadMore={loadMoreConversations}
        onRename={renameConversation}
        onDelete={handleDelete}
      />

      {book && messages.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-1.5 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            About{" "}
            <Link to={`/books/${book.id}`} className="underline underline-offset-2 hover:text-foreground">
              {book.title}
            </Link>
          </span>
          <button className="shrink-0 hover:text-foreground" onClick={() => handleNewChat(book)}>
            Start new
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <ChatEmptyState book={book} onSend={send} />
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              save={
                msg.id.startsWith("temp-")
                  ? undefined
                  : { conversationId, book, onSaved: notifyExcerptSaved }
              }
            />
          ))}

          {streaming && streamingContent && (
            <ChatMessage
              role="assistant"
              content={streamingContent}
              isStreaming
            />
          )}

          {streaming && (!streamingContent || thinking) && (
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
