interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: bold, italic, bullet/numbered lists, paragraphs.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    // Check if this paragraph is a list
    const lines = para.split("\n");
    const isBulletList = lines.every((l) => /^[-*]\s/.test(l.trim()));
    const isNumberedList = lines.every((l) => /^\d+[.)]\s/.test(l.trim()));

    if (isBulletList) {
      nodes.push(
        <ul key={i} className="my-1 ml-5 list-disc">
          {lines.map((line, j) => (
            <li key={j} className="mb-0.5">
              {inlineMarkdown(line.trim().replace(/^[-*]\s/, ""))}
            </li>
          ))}
        </ul>,
      );
    } else if (isNumberedList) {
      nodes.push(
        <ol key={i} className="my-1 ml-5 list-decimal">
          {lines.map((line, j) => (
            <li key={j} className="mb-0.5">
              {inlineMarkdown(line.trim().replace(/^\d+[.)]\s/, ""))}
            </li>
          ))}
        </ol>,
      );
    } else {
      nodes.push(
        <p key={i} className={i < paragraphs.length - 1 ? "mb-2" : ""}>
          {inlineMarkdown(para)}
        </p>,
      );
    }
  }

  return nodes;
}

/** Handle **bold**, *italic*, and line breaks within a block. */
function inlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, *italic*, or plain text segments
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)/g;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key++}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      // Handle single newlines as line breaks
      const parts = match[3].split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) nodes.push(<br key={key++} />);
        if (parts[i]) nodes.push(<span key={key++}>{parts[i]}</span>);
      }
    }
  }

  return nodes;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {content}
          </p>
        ) : (
          <div className="text-sm leading-relaxed">
            {renderMarkdown(content)}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
