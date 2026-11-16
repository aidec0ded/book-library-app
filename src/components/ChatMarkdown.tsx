import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { findBookId, useLibraryTitles, type TitleIndex } from "@/lib/book-titles";

/** The plain text inside an element, for matching an italicized title. */
function plainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("");
}

const linkClass = "underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-current";

function markdownComponents(titles: TitleIndex | null): Components {
  // Titles are written in italics; bold is sometimes used for them too
  const titleLink = (Tag: "em" | "strong", className?: string) =>
    function Emphasis({ children }: { children?: ReactNode }) {
      const element = <Tag className={className}>{children}</Tag>;
      const bookId = findBookId(titles, plainText(children));
      return bookId ? (
        <Link to={`/books/${bookId}`} className={linkClass}>
          {element}
        </Link>
      ) : (
        element
      );
    };

  return {
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    em: titleLink("em"),
    strong: titleLink("strong", "font-semibold"),
    ul: ({ children }) => <ul className="my-1 ml-5 list-disc space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 ml-5 list-decimal space-y-0.5">{children}</ol>,
    h1: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
    h2: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
    h3: ({ children }) => <p className="mb-1 mt-2 font-semibold first:mt-0">{children}</p>,
    h4: ({ children }) => <p className="mb-1 mt-2 font-medium first:mt-0">{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-muted-foreground/20" />,
    code: ({ children }) => <code className="rounded bg-background/60 px-1 py-0.5 text-[0.85em]">{children}</code>,
    pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded bg-background/60 p-2 text-xs">{children}</pre>,
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-muted-foreground/30 px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-muted-foreground/10 px-2 py-1 align-top">{children}</td>,
    a: ({ href, children }) =>
      // One slash: a page in the app. Two ("//site.com") is another site
      href && /^\/(?!\/)/.test(href) ? (
        <Link to={href} className={linkClass}>
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {children}
        </a>
      ),
    img: () => null,
  };
}

/**
 * A reply's markdown, with book titles linked to the book. Loaded on its own, since the
 * markdown library is a quarter of the app's size and only chat needs it.
 */
export default function ChatMarkdown({ content }: { content: string }) {
  const titles = useLibraryTitles();
  const components = useMemo(() => markdownComponents(titles), [titles]);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
