import { lazy, Suspense, useRef } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { SaveToBook } from "@/components/SaveToBook";
import type { ConversationBook, MessageAction } from "@/lib/types";

const ChatMarkdown = lazy(() => import("@/components/ChatMarkdown"));

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  /** A reply that didn't finish, shown faded */
  incomplete?: boolean;
  /** What the companion changed with its tools in this reply */
  actions?: MessageAction[] | null;
  /** Offers "Save to book" under the message. */
  save?: {
    conversationId: string | null;
    book: ConversationBook | null;
    onSaved: () => void;
  };
}

/** A label with *italic* names, as the server writes them. */
function ActionLabel({ label }: { label: string }) {
  return (
    <>
      {label.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <em key={i}>{part.slice(1, -1)}</em>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** What the companion changed, under its reply, each linking to where the change shows. */
export function ActionList({ actions }: { actions: MessageAction[] }) {
  const shown = actions.filter((action) => action.label);
  if (shown.length === 0) return null;

  return (
    <ul className="mt-1.5 space-y-1 px-1" aria-label="Changes made">
      {shown.map((action, i) => {
        const Icon = action.failed ? X : Check;
        const text = (
          <>
            <Icon className={`h-3 w-3 shrink-0 ${action.failed ? "text-destructive" : "text-accent"}`} />
            <span>
              <ActionLabel label={action.label!} />
              {action.failed && " (didn't go through)"}
            </span>
          </>
        );
        return (
          <li key={i} className="text-xs text-muted-foreground">
            {action.href && !action.failed ? (
              <Link to={action.href} className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline">
                {text}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">{text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChatMessage({ role, content, isStreaming, incomplete, actions, save }: ChatMessageProps) {
  const isUser = role === "user";
  const bubbleRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {(content || isStreaming) && (
        <div
          ref={bubbleRef}
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          } ${incomplete ? "opacity-60" : ""}`}
        >
          {isUser ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{content}</p>
          ) : (
            <div className="break-words text-sm leading-relaxed">
              {/* Plain text for the moment it takes the markdown renderer to load */}
              <Suspense fallback={<p className="whitespace-pre-line">{content}</p>}>
                <ChatMarkdown content={content} />
              </Suspense>
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
              )}
            </div>
          )}
        </div>
      )}
      {actions && actions.length > 0 && <ActionList actions={actions} />}
      {save && content && <SaveToBook content={content} bubbleRef={bubbleRef} {...save} />}
    </div>
  );
}
