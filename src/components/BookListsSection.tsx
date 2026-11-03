import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ProgressBadge } from "@/components/ProgressBadge";
import { SeminarSection } from "@/components/SeminarSection";
import {
  fetchListsForBook,
  updateItemProgress,
  updateItemSeminarContent,
  type BookListEntry,
} from "@/lib/lists";
import type { PathProgress, SeminarContent } from "@/lib/types";

interface BookListsSectionProps {
  bookId: string;
  bookStatus: string | null;
  /** Completing a book on a reading path also marks it as read. */
  onBookMarkedRead: () => void;
  onError: (message: string) => void;
}

export function BookListsSection({
  bookId,
  bookStatus,
  onBookMarkedRead,
  onError,
}: BookListsSectionProps) {
  const [entries, setEntries] = useState<BookListEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchListsForBook(bookId)
      .then((found) => {
        if (!cancelled) setEntries(found);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function handleProgressChange(entryId: string, next: PathProgress) {
    const previous = entries;
    setEntries((current) =>
      current.map((e) => (e.id === entryId ? { ...e, path_progress: next } : e)),
    );
    try {
      await updateItemProgress(entryId, next);
      if (next === "completed") onBookMarkedRead();
    } catch {
      setEntries(previous);
      onError("Failed to update progress");
    }
  }

  async function handleSeminarUpdate(entryId: string, content: SeminarContent) {
    const previous = entries;
    setEntries((current) =>
      current.map((e) => (e.id === entryId ? { ...e, seminar_content: content } : e)),
    );
    try {
      await updateItemSeminarContent(entryId, content);
    } catch {
      setEntries(previous);
      onError("Failed to save seminar content");
    }
  }

  if (entries.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 font-semibold">On your lists</h2>
      <div className="space-y-3">
        {entries.map((entry) => {
          const isPath = entry.list.list_type === "reading_path";
          const progress = entry.path_progress ?? "not_started";
          return (
            <div key={entry.id} className="space-y-3 rounded-md border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/syllabi/${entry.list.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {entry.list.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {isPath ? "Reading path" : "Syllabus"} · #{entry.position}
                  </p>
                </div>
                {isPath && (
                  <ProgressBadge
                    progress={progress}
                    onClick={(next) => void handleProgressChange(entry.id, next)}
                  />
                )}
              </div>
              {isPath ? (
                <SeminarSection
                  content={entry.seminar_content}
                  progress={progress}
                  onUpdate={(content) => void handleSeminarUpdate(entry.id, content)}
                  questionsOpenByDefault={bookStatus === "reading" || progress === "reading"}
                  promptsOpenByDefault={progress === "completed"}
                />
              ) : (
                entry.rationale && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{entry.rationale}</p>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
