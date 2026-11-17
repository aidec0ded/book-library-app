import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { localToday, parseTypedDate } from "@/lib/reading-dates";

// A date you can type ("10/20/2023", "Oct 20 2023") or pick from a calendar with month and
// year menus. Replaces the browser's date input, where typing a year resets on every key
// in some browsers and the calendar can only open on today's month.

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" }),
);
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const EARLIEST_YEAR = 1900;

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

interface View {
  year: number;
  month: number; // 0-11
}

function viewOf(date: string): View {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 };
}

interface DateFieldProps {
  id: string;
  value: string; // YYYY-MM-DD, or "" for none
  onChange: (value: string) => void;
  /** Latest date allowed (default today) */
  max?: string;
  /** Earliest date allowed */
  min?: string;
  /** The month the calendar opens on when there's no date yet */
  openOn?: string;
}

export function DateField({ id, value, onChange, max = localToday(), min, openOn }: DateFieldProps) {
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(viewOf(value || openOn || max));
  const container = useRef<HTMLDivElement>(null);
  const calendarId = useId();

  // A date set from outside (the calendar, Clear) shows in the text box
  useEffect(() => {
    setText(value ? formatDate(value) : "");
    setUnreadable(false);
  }, [value]);

  function openCalendar() {
    setView(viewOf(value || openOn || max));
    setOpen(true);
  }

  function commitText() {
    if (!text.trim()) {
      if (value) onChange("");
      setUnreadable(false);
      return;
    }
    const parsed = parseTypedDate(text, localToday());
    if (!parsed) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setText(formatDate(parsed));
    if (parsed !== value) onChange(parsed);
  }

  function pick(date: string) {
    onChange(date);
    setText(formatDate(date));
    setUnreadable(false);
    setOpen(false);
  }

  const maxView = viewOf(max);
  const minYear = min ? Number(min.slice(0, 4)) : EARLIEST_YEAR;
  const years = Array.from({ length: maxView.year - minYear + 1 }, (_, i) => maxView.year - i);
  const step = (months: number) =>
    setView((v) => {
      const total = v.year * 12 + v.month + months;
      return { year: Math.floor(total / 12), month: total % 12 };
    });
  const atEnd = view.year * 12 + view.month >= maxView.year * 12 + maxView.month;
  const atStart = view.year * 12 + view.month <= minYear * 12 + (min ? viewOf(min).month : 0);

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const today = localToday();

  return (
    <div
      ref={container}
      className="space-y-1"
      // Closes once focus has left the field, so the next field already has the cursor when
      // the calendar folds away and the page moves up
      onBlur={(e) => {
        if (!container.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <Input
          id={id}
          value={text}
          placeholder="e.g. 10/20/2023 or Oct 20 2023"
          autoComplete="off"
          aria-invalid={unreadable}
          aria-describedby={unreadable ? `${id}-error` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setUnreadable(false);
            // Follow along in the calendar as a date takes shape
            const parsed = parseTypedDate(e.target.value, today);
            if (parsed) setView(viewOf(parsed));
          }}
          onFocus={() => {
            if (!open) openCalendar();
          }}
          onClick={() => {
            if (!open) openCalendar();
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
              setOpen(false);
            } else if (e.key === "Escape" || e.key === "Tab") {
              setOpen(false);
            }
          }}
          className="pr-9"
        />
        <button
          type="button"
          aria-label={open ? "Close calendar" : "Open calendar"}
          aria-expanded={open}
          aria-controls={calendarId}
          onClick={() => (open ? setOpen(false) : openCalendar())}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      {unreadable && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          Couldn't read that date. Try 10/20/2023 or Oct 20 2023.
        </p>
      )}

      {open && (
        <div
          id={calendarId}
          className="w-fit rounded-md border bg-background p-2 shadow-sm"
          // Clicking in the calendar leaves the cursor in the text box (the menus still open)
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLSelectElement || e.target instanceof HTMLOptionElement)) e.preventDefault();
          }}
        >
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              disabled={atStart}
              onClick={() => step(-1)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              aria-label="Month"
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
              className="rounded border border-input bg-background px-1 py-0.5 text-sm"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={view.year}
              onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
              className="rounded border border-input bg-background px-1 py-0.5 text-sm"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              disabled={atEnd}
              onClick={() => step(1)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={`${MONTH_NAMES[view.month]} ${view.year}`}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const date = iso(view.year, view.month, day);
              const disabled = date > max || (min !== undefined && date < min);
              const selected = date === value;
              return (
                <button
                  key={date}
                  type="button"
                  tabIndex={-1}
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={formatDate(date)}
                  onClick={() => pick(date)}
                  className={`h-8 w-8 rounded text-sm ${
                    selected
                      ? "bg-primary text-primary-foreground"
                      : date === today
                        ? "font-semibold text-accent hover:bg-muted"
                        : "hover:bg-muted"
                  } disabled:pointer-events-none disabled:opacity-30`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
