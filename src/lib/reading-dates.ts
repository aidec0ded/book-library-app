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
