export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type TimingPosition = "early" | "mid" | "late";

export interface Timing {
  month: number; // 1-12
  position: TimingPosition;
}

export function getCurrentTiming(): Timing {
  const now = new Date();
  const day = now.getDate();
  let position: TimingPosition;
  if (day <= 10) {
    position = "early";
  } else if (day <= 20) {
    position = "mid";
  } else {
    position = "late";
  }
  return { month: now.getMonth() + 1, position };
}

export function formatTiming(month: number, position?: string | null): string {
  const monthName = MONTH_NAMES[month - 1] ?? `Month ${month}`;
  if (position) {
    return `${position.charAt(0).toUpperCase() + position.slice(1)} ${monthName}`;
  }
  return monthName;
}
