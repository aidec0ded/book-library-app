import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { MessageCircle, X, Maximize2, Send, Loader2, AlertCircle } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { useChatContext } from "@/contexts/ChatContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function ChatPanel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    conversationId,
    messages,
    input,
    streaming,
    streamingContent,
    error,
    messageLimitReached,
    setInput,
    send,
    panelOpen,
    openPanel,
    closePanel,
    togglePanel,
  } = useChatContext();
  const { isPaid, chatMessagesUsed, chatMessagesLimit, chatMessagesRemaining } = useSubscription();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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
  if (pathname === "/chat") return null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleExpand() {
    closePanel();
    navigate("/chat");
  }

  const canSend = input.trim().length > 0 && !streaming;

  // Conversations lookup for title
  const conversations = useChatContext().conversations;
  const activeConv = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : null;

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
          bottom-0 left-0 right-0 h-[85vh] rounded-t-xl border-t
          sm:bottom-6 sm:right-6 sm:left-auto sm:h-[500px] sm:w-[400px] sm:rounded-xl sm:border
          ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {activeConv?.title ?? "Chat"}
          </span>
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

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 && !streaming && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  What are you reading?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Talk about your books, get recommendations, or explore your
                  reading life.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
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
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t px-3 py-2">
          {messageLimitReached ? (
            <div className="py-2 text-center">
              <p className="text-sm text-muted-foreground">
                You've used all {chatMessagesLimit} free messages this month.
              </p>
              <Link
                to="/pricing"
                className="mt-1.5 inline-block text-sm font-medium text-accent hover:underline"
              >
                Upgrade for unlimited chat →
              </Link>
            </div>
          ) : (
            <>
              {!isPaid && chatMessagesLimit !== null && (
                <p className="mb-1.5 text-center text-xs text-muted-foreground">
                  {chatMessagesUsed} of {chatMessagesLimit} messages used
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Say something..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
                />
                <button
                  onClick={() => send()}
                  disabled={!canSend}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
