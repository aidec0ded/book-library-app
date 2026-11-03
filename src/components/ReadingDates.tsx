import { useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { localToday, readingDatesError, type ReadingDates as Dates } from "@/lib/reading-dates";

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ReadingDatesProps {
  status: string | null;
  dates: Dates;
  onSave: (dates: Dates) => void;
}

export function ReadingDates({ status, dates, onSave }: ReadingDatesProps) {
  const [editing, setEditing] = useState(false);
  const [started, setStarted] = useState("");
  const [finished, setFinished] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finishedLabel = status === "unfinished" ? "Stopped" : "Finished";
  const hasDates = Boolean(dates.date_started || dates.date_finished);
  const notStarted = status === "unread" || status === "wishlist" || status === null;

  // Nothing to say about a book the reader hasn't started, unless a date needs clearing
  if (notStarted && !hasDates) return null;

  function startEditing() {
    setStarted(dates.date_started ?? "");
    setFinished(dates.date_finished ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    const next = { date_started: started || null, date_finished: finished || null };
    const problem = readingDatesError(next, localToday());
    if (problem) {
      setError(problem);
      return;
    }
    setEditing(false);
    onSave(next);
  }

  if (editing) {
    const today = localToday();
    const fields = [
      { label: "Started", value: started, set: setStarted },
      { label: finishedLabel, value: finished, set: setFinished },
    ];
    return (
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`reading-date-${field.label}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {field.label}
              </label>
              {field.value && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => field.set("")}
                >
                  Clear
                </button>
              )}
            </div>
            <Input
              id={`reading-date-${field.label}`}
              type="date"
              max={today}
              value={field.value}
              onChange={(e) => {
                field.set(e.target.value);
                setError(null);
              }}
            />
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
            onClick={save}
          >
            Save
          </button>
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      {dates.date_started && (
        <div className="flex items-baseline gap-2">
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Started</span>
          <span>{formatDate(dates.date_started)}</span>
        </div>
      )}
      {dates.date_finished && (
        <div className="flex items-baseline gap-2">
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{finishedLabel}</span>
          <span>{formatDate(dates.date_finished)}</span>
        </div>
      )}
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={startEditing}
      >
        <Pencil className="h-3 w-3" /> {hasDates ? "Edit dates" : "Add dates"}
      </button>
    </div>
  );
}
