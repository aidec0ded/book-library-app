interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

function renderContent(text: string): React.ReactNode[] {
  // Match markdown links [text](url) and bare URLs
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const linkClass = "underline underline-offset-2 hover:text-primary";
    if (match[1] && match[2]) {
      // Markdown link: [text](url)
      parts.push(
        <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {match[1]}
        </a>
      );
    } else {
      // Bare URL
      const url = match[3];
      parts.push(
        <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {url}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
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
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {isUser ? content : renderContent(content)}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
          )}
        </p>
      </div>
    </div>
  );
}
