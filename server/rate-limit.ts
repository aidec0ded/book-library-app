import type http from "node:http";

/**
 * Request limits per IP address and per reader, so one source can't flood the API.
 * Kept in memory, which works because there's one server; counts reset on deploy.
 *
 * Limits are generous for a person and tight for a script: a reader sends a chat
 * message every few seconds at most, a signed-out visitor sends the contact form once.
 */

interface Rule {
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RULES = {
  /** Every API request from one address */
  api: { limit: 300, windowMs: MINUTE },
  /** Chat messages from one address (several readers can share one, at home or work) */
  chatPerIp: { limit: 60, windowMs: 10 * MINUTE },
  /** Chat messages from one reader */
  chatPerReader: { limit: 10, windowMs: MINUTE },
  /** The contact form, which needs no sign-in and writes to the database */
  contact: { limit: 5, windowMs: HOUR },
  /** Add Book searches, which share one ISBNdb key at one request a second */
  isbndb: { limit: 60, windowMs: MINUTE },
  /** Requests that start work or reach Stripe: curation, checkout, the billing portal, account deletion */
  sensitive: { limit: 20, windowMs: HOUR },
} satisfies Record<string, Rule>;

export const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a minute and try again.";

const windows = new Map<string, { count: number; resetAt: number }>();

/** Count a request against a rule. Returns how many seconds to wait if it's over the limit. */
export function hit(rule: keyof typeof RULES, key: string): { ok: true } | { ok: false; retryAfter: number } {
  const { limit, windowMs } = RULES[rule];
  const id = `${rule}:${key}`;
  const now = Date.now();
  let entry = windows.get(id);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(id, entry);
  }
  entry.count++;
  if (entry.count <= limit) return { ok: true };
  if (entry.count === limit + 1) {
    console.warn(`[rate-limit] ${rule} limit of ${limit} reached for ${key}`);
  }
  return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

// Forget finished windows, so the map holds only recent visitors
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of windows) if (entry.resetAt <= now) windows.delete(id);
}, 5 * MINUTE).unref();

/**
 * The visitor's address. Requests come through Cloudflare, which sets CF-Connecting-IP,
 * then Render, which adds X-Forwarded-For. Someone calling the Render address directly
 * could fake these, which is why chat also has a per-reader limit that can't be faked.
 */
export function clientIp(req: http.IncomingMessage): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf.trim();
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** Answer a request that's over a limit. */
export function rejectRateLimited(res: http.ServerResponse, retryAfter: number): void {
  res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(retryAfter) });
  res.end(JSON.stringify({ error: "rate_limited", message: RATE_LIMITED_MESSAGE }));
}
