import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SeminarContent, PathProgress } from "@/lib/types";

interface SeminarSectionProps {
  content: SeminarContent | null;
  progress: PathProgress;
  onUpdate: (content: SeminarContent) => void;
}

export function SeminarSection({
  content,
  progress,
  onUpdate,
}: SeminarSectionProps) {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);

  // Editing state
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [editingPromptIdx, setEditingPromptIdx] = useState<number | null>(null);
  const [promptDraft, setPromptDraft] = useState("");

  const preReadingContext = content?.pre_reading_context ?? "";
  const focusQuestions = content?.focus_questions ?? [];
  const postReadingPrompts = content?.post_reading_prompts ?? [];

  function updateContent(partial: Partial<SeminarContent>) {
    onUpdate({
      pre_reading_context: content?.pre_reading_context ?? "",
      focus_questions: content?.focus_questions ?? [],
      post_reading_prompts: content?.post_reading_prompts ?? [],
      ...partial,
    });
  }

  function handleSaveContext() {
    setEditingContext(false);
    updateContent({ pre_reading_context: contextDraft.trim() });
  }

  function handleSaveQuestion(idx: number) {
    setEditingQuestionIdx(null);
    const trimmed = questionDraft.trim();
    if (!trimmed) {
      // Remove empty question
      updateContent({
        focus_questions: focusQuestions.filter((_, i) => i !== idx),
      });
    } else {
      const updated = [...focusQuestions];
      updated[idx] = trimmed;
      updateContent({ focus_questions: updated });
    }
  }

  function handleAddQuestion() {
    const updated = [...focusQuestions, ""];
    updateContent({ focus_questions: updated });
    setEditingQuestionIdx(updated.length - 1);
    setQuestionDraft("");
  }

  function handleRemoveQuestion(idx: number) {
    updateContent({
      focus_questions: focusQuestions.filter((_, i) => i !== idx),
    });
  }

  function handleSavePrompt(idx: number) {
    setEditingPromptIdx(null);
    const trimmed = promptDraft.trim();
    if (!trimmed) {
      updateContent({
        post_reading_prompts: postReadingPrompts.filter((_, i) => i !== idx),
      });
    } else {
      const updated = [...postReadingPrompts];
      updated[idx] = trimmed;
      updateContent({ post_reading_prompts: updated });
    }
  }

  function handleAddPrompt() {
    const updated = [...postReadingPrompts, ""];
    updateContent({ post_reading_prompts: updated });
    setEditingPromptIdx(updated.length - 1);
    setPromptDraft("");
  }

  function handleRemovePrompt(idx: number) {
    updateContent({
      post_reading_prompts: postReadingPrompts.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-3">
      {/* Pre-reading context */}
      {editingContext ? (
        <div className="space-y-2">
          <Textarea
            value={contextDraft}
            onChange={(e) => setContextDraft(e.target.value)}
            autoFocus
            rows={3}
            placeholder="Why this book is here, what it builds on..."
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingContext(false);
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveContext}
              className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground hover:bg-accent/90"
            >
              Save
            </button>
            <button
              onClick={() => setEditingContext(false)}
              className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : preReadingContext ? (
        <div
          className="cursor-pointer border-l-2 border-violet-300 pl-4 dark:border-violet-700"
          onClick={() => {
            setEditingContext(true);
            setContextDraft(preReadingContext);
          }}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {preReadingContext}
          </p>
        </div>
      ) : (
        <button
          onClick={() => {
            setEditingContext(true);
            setContextDraft("");
          }}
          className="text-sm italic text-muted-foreground/50 hover:text-muted-foreground"
        >
          Add pre-reading context...
        </button>
      )}

      {/* Focus Questions — expandable */}
      {focusQuestions.length > 0 && (
        <div>
          <button
            onClick={() => setQuestionsOpen(!questionsOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {questionsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Focus Questions ({focusQuestions.length})
          </button>
          {questionsOpen && (
            <ul className="mt-2 space-y-2 pl-5">
              {focusQuestions.map((q, i) =>
                editingQuestionIdx === i ? (
                  <li key={i}>
                    <Input
                      value={questionDraft}
                      onChange={(e) => setQuestionDraft(e.target.value)}
                      autoFocus
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveQuestion(i);
                        if (e.key === "Escape") setEditingQuestionIdx(null);
                      }}
                    />
                  </li>
                ) : (
                  <li
                    key={i}
                    className="group/q flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span
                      className="flex-1 cursor-pointer hover:text-foreground"
                      onClick={() => {
                        setEditingQuestionIdx(i);
                        setQuestionDraft(q);
                      }}
                    >
                      {q}
                    </span>
                    <button
                      onClick={() => handleRemoveQuestion(i)}
                      className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover/q:opacity-100"
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ),
              )}
              <li>
                <button
                  onClick={handleAddQuestion}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                >
                  <Plus className="h-3 w-3" />
                  Add question
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Post-reading prompts — expandable, visually gated */}
      {postReadingPrompts.length > 0 && (
        <div className={progress !== "completed" ? "opacity-50" : ""}>
          <button
            onClick={() => setPromptsOpen(!promptsOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {promptsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            After Reading ({postReadingPrompts.length})
            {progress !== "completed" && (
              <span className="ml-1 normal-case tracking-normal text-muted-foreground/60">
                — available after completing
              </span>
            )}
          </button>
          {promptsOpen && (
            <ul className="mt-2 space-y-2 pl-5">
              {postReadingPrompts.map((p, i) =>
                editingPromptIdx === i ? (
                  <li key={i}>
                    <Input
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      autoFocus
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSavePrompt(i);
                        if (e.key === "Escape") setEditingPromptIdx(null);
                      }}
                    />
                  </li>
                ) : (
                  <li
                    key={i}
                    className="group/p flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span
                      className="flex-1 cursor-pointer hover:text-foreground"
                      onClick={() => {
                        setEditingPromptIdx(i);
                        setPromptDraft(p);
                      }}
                    >
                      {p}
                    </span>
                    <button
                      onClick={() => handleRemovePrompt(i)}
                      className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover/p:opacity-100"
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ),
              )}
              <li>
                <button
                  onClick={handleAddPrompt}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                >
                  <Plus className="h-3 w-3" />
                  Add prompt
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Add seminar sections if none exist */}
      {!content && (
        <div className="flex gap-3">
          <button
            onClick={handleAddQuestion}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
          >
            <Plus className="h-3 w-3" />
            Add focus questions
          </button>
          <button
            onClick={handleAddPrompt}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
          >
            <Plus className="h-3 w-3" />
            Add post-reading prompts
          </button>
        </div>
      )}
    </div>
  );
}
