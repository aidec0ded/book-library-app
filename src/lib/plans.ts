/**
 * The plans as readers are told about them, shared by the public pages and the server,
 * so the wording and the limits can't drift apart. The server can still override the
 * reply cap and the free period's end with environment variables; if it does, change
 * these too.
 */

/** Replies a month from the reading companion on Free. */
export const FREE_MONTHLY_REPLIES = 5;
/** Companion's fair-use cap on replies a month (PAID_MONTHLY_REPLY_CAP on the server). */
export const COMPANION_MONTHLY_REPLIES = 100;
/** Onboarding messages that don't count against the monthly limit. */
export const ONBOARDING_FREE_MESSAGES = 20;

export const COMPANION_MONTHLY_PRICE = 7;
export const COMPANION_ANNUAL_PRICE = 60;

/**
 * Everyone has Companion until this moment: midnight on 1 January 2027, US Pacific, so
 * readers across the US keep it through 31 December (FREE_PERIOD_ENDS on the server).
 */
export const FREE_PERIOD_ENDS_ISO = "2027-01-01T08:00:00Z";

export function inFreePeriod(now = new Date()): boolean {
  return now < new Date(FREE_PERIOD_ENDS_ISO);
}

/** "December 31, 2026": the last day of the free period. */
export const FREE_PERIOD_LAST_DAY = "December 31, 2026";
/** "January 1": when Companion billing starts for anyone who subscribed during it. */
export const FREE_PERIOD_BILLING_STARTS = "January 1";
