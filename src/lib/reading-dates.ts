export type ReadingDates = {
  date_started: string | null;
  date_finished: string | null;
};

/** Today on the reader's own calendar. toISOString would give tomorrow's date on a US evening. */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Date changes that go with moving a book to a new status today. Fills in blanks and never
 * replaces an earlier date. A date set today is undone when the move is, so picking the
 * wrong status doesn't leave a date behind that blocks the real one later.
 */
export function datesForStatusChange(
  status: string,
  current: ReadingDates,
  today: string,
): Partial<ReadingDates> {
  const changes: Partial<ReadingDates> = {};

  if (status === "reading") {
    const undoingFinish = current.date_finished === today;
    if (undoingFinish) changes.date_finished = null;
    // A finish date from before means this isn't the first read, and today's start would
    // land after it. The reader can set the dates for a reread themselves.
    if (!current.date_started && (undoingFinish || !current.date_finished)) {
      changes.date_started = today;
    }
  } else if (status === "read") {
    if (!current.date_finished) changes.date_finished = today;
  } else if (status === "unread" || status === "wishlist") {
    if (current.date_started === today) changes.date_started = null;
    if (current.date_finished === today) changes.date_finished = null;
  }

  return changes;
}

/** What's wrong with these dates, in words for the reader, or null if they're fine. */
export function readingDatesError(dates: ReadingDates, today: string): string | null {
  if ((dates.date_started ?? "") > today || (dates.date_finished ?? "") > today) {
    return "Dates can't be in the future.";
  }
  if (dates.date_started && dates.date_finished && dates.date_finished < dates.date_started) {
    return "The end date can't be before the start date.";
  }
  return null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function isoFrom(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return year >= 1000 && isIsoDate(iso) ? iso : null;
}

/** A two-digit year as the most recent year it could be: "23" is 2023, "98" is 1998. */
function fullYear(year: number, today: string): number {
  if (year >= 100) return year;
  const thisYear = Number(today.slice(0, 4));
  const candidate = Math.floor(thisYear / 100) * 100 + year;
  return candidate > thisYear ? candidate - 100 : candidate;
}

/**
 * A date the reader typed, as YYYY-MM-DD, or null if it can't be read. Takes the ways people
 * write dates in the US and the forms sites like Goodreads show: "10/20/2023", "10-20-23",
 * "2023-10-20", "Oct 20, 2023", "October 20 2023", "20 Oct 2023". Without a year ("Oct 20")
 * it's the most recent such day up to today.
 */
export function parseTypedDate(text: string, today: string): string | null {
  const t = text.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  if (!t) return null;

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return isoFrom(fullYear(Number(m[3]), today), Number(m[1]), Number(m[2]));

  // "oct", "oct.", "sept", "october": at least three letters of a month's name
  const monthOf = (word: string) => {
    const w = word.replace(/\.$/, "");
    const i = w.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(w)) : -1;
    return i + 1;
  };
  // "oct 20 2023" / "october 20" and "20 oct 2023" / "20 october"
  m = t.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{2}|\d{4}))?$/) ?? null;
  let parts: { month: number; day: number; year?: number } | null = null;
  if (m?.[1] && monthOf(m[1])) parts = { month: monthOf(m[1]), day: Number(m[2]), year: m[3] ? Number(m[3]) : undefined };
  if (!parts) {
    m = t.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{2}|\d{4}))?$/);
    if (m?.[2] && monthOf(m[2])) parts = { month: monthOf(m[2]), day: Number(m[1]), year: m[3] ? Number(m[3]) : undefined };
  }
  if (!parts) return null;

  if (parts.year !== undefined) return isoFrom(fullYear(parts.year, today), parts.month, parts.day);
  const thisYear = Number(today.slice(0, 4));
  const thisYears = isoFrom(thisYear, parts.month, parts.day);
  return thisYears && thisYears <= today ? thisYears : isoFrom(thisYear - 1, parts.month, parts.day);
}
