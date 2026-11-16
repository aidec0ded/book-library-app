import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatEmptyState } from "@/components/ChatEmptyState";
import { ChatThread } from "@/components/ChatThread";
import { ConversationList } from "@/components/ConversationList";
import { useChatContext } from "@/contexts/ChatContext";

export function Chat() {
  const { id: linkedId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const chat = useChatContext();
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
    waitingForReply,
    messageLimitReached,
    setInput,
    send,
    stop,
    selectConversation,
    newChat,
    loadMoreConversations,
    renameConversation,
    deleteConversation,
    closePanel,
  } = chat;

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

  // And follows along once a new conversation has an ID, or leaves its link when it's gone
  // (a reply stopped before it began takes the conversation it started with it)
  const previousId = useRef(conversationId);
  useEffect(() => {
    if (conversationId && conversationId !== linkedId) {
      navigate(`/chat/${conversationId}`, { replace: true });
    } else if (!conversationId && previousId.current && previousId.current === linkedId) {
      navigate("/chat", { replace: true });
    }
    previousId.current = conversationId;
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

  return (
    // dvh, not vh: on phones vh counts the space behind the browser's own bars
    <div className="flex h-[calc(100dvh-53px)] flex-col lg:h-dvh">
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
        {messages.length === 0 && !streaming && !chat.error && (
          <ChatEmptyState book={book} onSend={send} />
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          <ChatThread {...chat} />
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <ChatComposer
            input={input}
            setInput={setInput}
            send={() => send()}
            stop={stop}
            streaming={streaming}
            waitingForReply={waitingForReply}
            messageLimitReached={messageLimitReached}
            textareaRef={textareaRef}
          />
        </div>
      </div>
    </div>
  );
}
