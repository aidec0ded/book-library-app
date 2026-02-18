import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { useChatSession } from "@/hooks/useChatSession";
import { completeOnboarding } from "@/lib/onboarding";
import { capture } from "@/lib/posthog";

type Phase = "welcome" | "chat";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imported = searchParams.get("imported") === "true";

  const [phase, setPhase] = useState<Phase>(imported ? "chat" : "welcome");
  const [completing, setCompleting] = useState(false);

  const {
    messages,
    input,
    streaming,
    streamingContent,
    error,
    setInput,
    send,
  } = useChatSession({ onboarding: true });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (phase === "chat") {
      inputRef.current?.focus();
    }
  }, [phase]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;

  async function handleComplete() {
    setCompleting(true);
    try {
      capture("onboarding_completed", { messages_sent: userMessageCount });
      await completeOnboarding();
      navigate("/home", { replace: true });
    } catch {
      setCompleting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (phase === "welcome") {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <nav className="flex w-full items-center justify-between px-6 py-8 md:px-12">
          <span className="font-serif text-2xl font-bold tracking-tight">
            Rekollekt
          </span>
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="max-w-lg text-center">
            <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
              Welcome to Rekollekt
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Your reading life, understood. Let's set up your library
              so the AI can start learning your taste.
            </p>

            <div className="mt-10 flex flex-col gap-4">
              <button
                onClick={() => {
                  capture("onboarding_started");
                  setPhase("chat");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-semibold text-background transition-all hover:opacity-90"
              >
                Let's get started
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  capture("onboarding_import_chosen");
                  navigate("/import?from=onboarding");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-8 py-3.5 text-sm font-semibold transition-colors hover:bg-accent"
              >
                I have a Goodreads export
              </button>
            </div>

            <button
              onClick={() => {
                capture("onboarding_skipped");
                handleComplete();
              }}
              disabled={completing}
              className="mt-8 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              I'll explore on my own
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Phase: chat
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-serif text-lg font-bold tracking-tight">
          Rekollekt
        </span>
        <button
          onClick={handleComplete}
          disabled={completing}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
        >
          Start exploring
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Send a message to start chatting about books.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
            />
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
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me about a book..."
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/30"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className="shrink-0 rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingPage;
