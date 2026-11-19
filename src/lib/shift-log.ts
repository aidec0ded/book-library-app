import type { TasteShift } from "./types.js";

/**
 * When a shift-log entry happened, as readers and the AI see it: the period it describes
 * ("2023", "Spring–fall 2024") for a shift traced from reading dates, otherwise the month
 * it was noted.
 */
export function shiftWhen(shift: TasteShift): string {
  if (shift.period?.trim()) return shift.period.trim();
  return new Date(shift.noted_at).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}
