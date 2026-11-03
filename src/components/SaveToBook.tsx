import { useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { BookSearchModal } from "@/components/BookSearchModal";
import { saveExcerpt } from "@/lib/excerpts";
import { capture } from "@/lib/posthog";

interface SaveToBookProps {
  content: string;
  bubbleRef: RefObject<HTMLDivElement | null>;
  conversationId: string | null;
  book: { id: string; title: string } | null;
  onSaved: () => void;
}

/** Keep part or all of a message on a book's page, by hand. */
export function SaveToBook({ content, bubbleRef, conversationId, book, onSaved }: SaveToBookProps) {
  const [state, setState] = useState<"idle" | "editing" | "saved">("idle");
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState(book);
  const [choosingBook, setChoosingBook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    // Start from what's highlighted in this message, if anything
    const selection = window.getSelection();
    const selected =
      selection && !selection.isCollapsed && bubbleRef.current?.contains(selection.anchorNode)
        ? selection.toString().trim()
        : "";
    setDraft(selected || content);
    setTarget(book);
    setError(null);
    setState("editing");
    if (!book) setChoosingBook(true);
  }

  async function save() {
    if (!target || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveExcerpt({ bookId: target.id, conversationId, content: draft.trim() });
      capture("excerpt_saved", { source: "reader" });
      onSaved();
      setState("saved");
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (state === "saved" && target) {
    return (
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        Saved to{" "}
        <Link to={`/books/${target.id}`} className="underline underline-offset-2 hover:text-foreground">
          {target.title}
        </Link>
      </p>
    );
  }

  if (state === "editing") {
    return (
      <div className="mt-2 w-full max-w-[80%] space-y-2 rounded-lg border bg-background p-2.5">
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="What to save"
          className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none ring-ring focus-visible:ring-2"
        />
        <p className="text-xs text-muted-foreground">
          {target ? (
            <>
              Saving to <span className="font-medium text-foreground">{target.title}</span>
            </>
          ) : (
            "Choose a book to save this to."
          )}{" "}
          <button
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setChoosingBook(true)}
          >
            {target ? "Change" : "Choose book"}
          </button>
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!target || !draft.trim() || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
            onClick={() => setState("idle")}
          >
            Cancel
          </button>
        </div>
        {choosingBook && (
          <BookSearchModal
            onSelect={(chosen) => {
              setTarget({ id: chosen.id, title: chosen.title });
              setChoosingBook(false);
            }}
            onClose={() => setChoosingBook(false)}
          />
        )}
      </div>
    );
  }

  return (
    <button
      // Clicking shouldn't clear a selection in the message before it's read
      onMouseDown={(e) => e.preventDefault()}
      onClick={startEditing}
      className="mt-1 flex items-center gap-1 rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <Bookmark className="h-3 w-3" />
      Save to book
    </button>
  );
}
