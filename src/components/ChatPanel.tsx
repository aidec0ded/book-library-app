import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { MessageCircle, X, Maximize2, List, Plus } from "lucide-react";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatEmptyState } from "@/components/ChatEmptyState";
import { ChatThread } from "@/components/ChatThread";
import { ConversationItems } from "@/components/ConversationItems";
import { useChatContext } from "@/contexts/ChatContext";

export function ChatPanel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const chat = useChatContext();
  const {
    conversationId,
    book,
    title,
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
    newChat,
    selectConversation,
    loadMoreConversations,
    renameConversation,
    deleteConversation,
    panelOpen,
    openPanel,
    closePanel,
  } = chat;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showingList, setShowingList] = useState(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Back to the conversation whenever it changes or the panel reopens
  useEffect(() => {
    setShowingList(false);
  }, [conversationId, book, panelOpen]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (panelOpen) {
      // Small delay to wait for mount animation
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [panelOpen]);

  // Animate in
  useEffect(() => {
    if (panelOpen) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [panelOpen]);

  // Close on Escape
  useEffect(() => {
    if (!panelOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [panelOpen, closePanel]);

  // Hide entirely on the /chat page
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return null;

  function handleExpand() {
    closePanel();
    navigate(conversationId ? `/chat/${conversationId}` : "/chat");
  }

  // FAB only when panel is closed
  if (!panelOpen) {
    return (
      <button
        onClick={() => openPanel()}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/30 sm:hidden"
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className={`fixed z-30 flex flex-col border bg-card shadow-xl transition-all duration-200 ease-out
          bottom-0 left-0 right-0 h-[85dvh] rounded-t-xl border-t
          sm:bottom-6 sm:right-6 sm:left-auto sm:h-[500px] sm:w-[400px] sm:rounded-xl sm:border
          ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {showingList ? "Conversations" : (title ?? book?.title ?? "Chat")}
          </span>
          <button
            onClick={() => setShowingList((showing) => !showing)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={showingList ? "Back to conversation" : "Show conversations"}
            aria-pressed={showingList}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              newChat();
              setShowingList(false);
              textareaRef.current?.focus();
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleExpand}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expand to full page"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={closePanel}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showingList && (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <ConversationItems
              conversations={conversations}
              activeId={conversationId}
              loading={conversationsLoading}
              hasMore={hasMoreConversations}
              onSelect={(id) => {
                selectConversation(id);
                setShowingList(false);
              }}
              onLoadMore={loadMoreConversations}
              onRename={renameConversation}
              onDelete={deleteConversation}
            />
          </div>
        )}

        {!showingList && book && messages.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              About{" "}
              <Link to={`/books/${book.id}`} className="underline underline-offset-2 hover:text-foreground">
                {book.title}
              </Link>
            </span>
            <button
              className="shrink-0 hover:text-foreground"
              onClick={() => {
                newChat(book);
                textareaRef.current?.focus();
              }}
            >
              Start new
            </button>
          </div>
        )}

        {/* Messages area */}
        <div className={`flex-1 overflow-y-auto px-3 py-3 ${showingList ? "hidden" : ""}`}>
          {messages.length === 0 && !streaming && !chat.error && (
            <ChatEmptyState book={book} compact onSend={send} />
          )}

          <div className="space-y-3">
            <ChatThread {...chat} compact />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className={`border-t px-3 py-2 ${showingList ? "hidden" : ""}`}>
          <ChatComposer
            input={input}
            setInput={setInput}
            send={() => send()}
            stop={stop}
            streaming={streaming}
            waitingForReply={waitingForReply}
            messageLimitReached={messageLimitReached}
            textareaRef={textareaRef}
            compact
          />
        </div>
      </div>
    </>
  );
}
