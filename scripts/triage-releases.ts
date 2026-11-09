/**
 * Triage a month of new releases before scoring, so only new books for adult
 * readers reach the scorer. Two steps, cheapest first:
 *
 * 1. Rules, free: non-book formats, academic and textbook publishers, children's
 *    and education subjects, activity books, special editions, very short books,
 *    and other formats of a book already in the month (one edition is kept).
 * 2. An AI check (Claude Haiku 5.5) on what's left, from the listing alone:
 *    is this a new book, a reprint of an earlier one, or not for general readers?
 *    This catches what rules can't, like a plain paperback of a 1986 novel.
 *
 * Each release gets triaged_at, and skip_reason when it's dropped.
 *
 *   npx tsx scripts/triage-releases.ts --month 2026-11
 *   npx tsx scripts/triage-releases.ts --month 2026-11 --dry-run --report triage.json
 *   npx tsx scripts/triage-releases.ts --month 2026-11 --rules-only --dry-run
 *   npx tsx scripts/triage-releases.ts --month 2026-11 --redo not_for_general_readers,academic_publisher
 *
 * --dry-run triages every release in the month and writes nothing to the database
 * (the AI check still runs unless --rules-only). --force re-triages releases
 * already triaged. --redo re-triages only releases dropped for the given reasons,
 * after the rules or prompt change. --report writes each release's outcome to a JSON file.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { formatCategory, normalizeWorkKey } from "../src/lib/editions.js";
import { fetchAllRows } from "./fetch-all.js";

config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// --- CLI args ---

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const rulesOnly = args.includes("--rules-only");
const reportPath = argValue("--report");
const monthArg = argValue("--month");
const redo = argValue("--redo")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

// --- Constants ---

const MODEL = "claude-haiku-5-5";
const AI_BATCH_SIZE = 100;
const AI_CONCURRENCY = 4;
const MIN_PAGES = 48;
const UPDATE_CHUNK = 200;

export type SkipReason =
  | "format"
  | "academic_publisher"
  | "children_or_education"
  | "activity_book"
  | "special_edition"
  | "too_short"
  | "duplicate_format"
  | "reprint"
  | "not_for_general_readers";

interface Release {
  id: string;
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string | null;
  binding: string | null;
  page_count: number | null;
  date_published: string | null;
  subjects: string[];
  synopsis: string | null;
  general_signal_score: number | null;
  triaged_at: string | null;
  skip_reason: SkipReason | null;
}

// --- Rules ---

// Audio, board books, cards, calendars, stationery, bundles, leather (mostly Bibles), library bindings
const NON_BOOK_FORMAT =
  /audio|mp3|\bcd\b|board|cards?\b|calendar|diary|accessory|misc|suppl|novelty|bundle|access code|loose|spiral|ring|staple|leather|library|mook|digital (on|product)/i;

// Academic, technical, and textbook publishers. University presses aren't here: many
// of their books are written for general readers, so the AI check decides those.
const ACADEMIC_PUBLISHER =
  /\b(springer|elsevier|crc press|wiley|taylor & francis|routledge|academic press|bloomsbury academic|gale|cengage|de gruyter|brill|palgrave|igi global|emerald (group )?publishing|edward elgar|lexington books|peter lang|mcgraw|pearson|iste|meta4books|ridderprint)\b/i;

const CHILDREN_OR_EDUCATION_SUBJECT = /\b(juvenile|study aids|textbooks?|test prep|activity books)\b/i;

const ACTIVITY_TITLE =
  /\b(activity book|colou?ring book|workbook|planner|sticker book|study guide|test prep|practice tests?|flash ?cards|log ?book|sketchbook|word search|sudoku|crosswords?|puzzle book|(guided|gratitude|prompt) journal)\b/i;

const SPECIAL_EDITION_TITLE =
  /\b(anniversary|deluxe|collector'?s|annotated|limited|special|compact comics|clearview) edition\b|\bclassics\)|\breissue\b/i;

// Large print editions of trade books. Thorndike belongs to Cengage, so without this
// its novels would be dropped as academic. ISBNdb often lists only the large print
// edition of a new book, so it isn't dropped by itself: it loses to any other format
// of the same book, and the AI check decides whether it's new or a reprint.
const LARGE_PRINT = /large print|thorndike|center point/i;

function isLargePrint(r: Release): boolean {
  return LARGE_PRINT.test(`${r.publisher ?? ""} | ${r.binding ?? ""} | ${r.title}`);
}

function ruleReason(r: Release): SkipReason | null {
  const binding = (r.binding ?? "").replace(/_/g, " ");
  if (formatCategory(binding) !== "ebook" && NON_BOOK_FORMAT.test(binding)) return "format";
  if (r.publisher && ACADEMIC_PUBLISHER.test(r.publisher) && !isLargePrint(r)) return "academic_publisher";
  if (r.subjects.some((s) => CHILDREN_OR_EDUCATION_SUBJECT.test(s))) return "children_or_education";
  if (ACTIVITY_TITLE.test(r.title)) return "activity_book";
  if (SPECIAL_EDITION_TITLE.test(r.title)) return "special_edition";
  if (r.page_count != null && r.page_count < MIN_PAGES) return "too_short";
  return null;
}

// Which format to keep when a book comes out in several in the same month
const FORMAT_RANK: Record<string, number> = { hardcover: 0, paperback: 1, other: 2, ebook: 3, audiobook: 4 };
const formatRank = (r: Release) => (isLargePrint(r) ? 5 : FORMAT_RANK[formatCategory(r.binding)]);

const workKey = (r: Release) => normalizeWorkKey(r.title, r.authors[0]);

/**
 * Mark every format of a book but one as a duplicate. `keptWorks` holds books
 * already kept by an earlier run, whose other formats are all duplicates.
 */
function markDuplicateFormats(releases: Release[], reasons: Map<string, SkipReason>, keptWorks: Set<string>): void {
  const works = new Map<string, Release[]>();
  for (const r of releases) {
    if (reasons.has(r.id)) continue;
    const key = workKey(r);
    if (keptWorks.has(key)) {
      reasons.set(r.id, "duplicate_format");
      continue;
    }
    works.set(key, [...(works.get(key) ?? []), r]);
  }
  for (const editions of works.values()) {
    if (editions.length < 2) continue;
    // Keep a hardcover over a paperback over an ebook over large print, then one with a synopsis
    const [, ...rest] = [...editions].sort(
      (a, b) =>
        formatRank(a) - formatRank(b) ||
        Number(!a.synopsis) - Number(!b.synopsis) ||
        a.isbn13.localeCompare(b.isbn13),
    );
    for (const r of rest) reasons.set(r.id, "duplicate_format");
  }
}

// --- AI check ---

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You sort a month of upcoming book releases for a reading app. Its readers want to hear about genuinely new books, the way Kirkus Reviews or Publishers Weekly cover a season: new novels, story collections, poetry, memoir, essays, and nonfiction written for general readers. The listings come from a bookseller database, so many are not that.

Give each listing one verdict:

new: a first publication of this work for adult readers. Includes new fiction and poetry, narrative and popular nonfiction, new volumes in an ongoing series, graphic novels and manga volumes, young adult fiction, and the first English translation of a work. Also includes serious books of ideas from university presses and technical publishers (on science, technology, AI, philosophy, mind, history, culture, law, and economics) and hands-on technical books on a subject, since some readers seek these out. When unsure between new and not_general, say new.

reprint: this work was published before and this is a later edition. A paperback of a book whose hardcover came out in an earlier year, a reissue or repackaging, a new translation or edition of a classic, a collected edition of earlier comics, an omnibus or box set of earlier books. Use what you know about the title and author. Only say reprint when you recognize the work as published earlier or the listing itself says so; if you don't recognize a title, judge it new.

not_general: a book only a student, specialist, or child would read. Textbooks and course readers, handbooks, companions, encyclopedias and other reference works, conference proceedings, edited scholarly collections, narrow specialist monographs (a dissertation-style study of one case, text, or method), clinical and job-specific professional manuals (nursing, accounting, legal practice, certification), children's books (picture books through middle grade), activity, coloring, puzzle, journal and gift books, study guides and summaries, test prep, and calendars.

Each listing is one line: isbn | title | authors | publisher | format | pages | publication date | subjects. Return a verdict for every isbn.`;

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          isbn: { type: "string" },
          verdict: { type: "string", enum: ["new", "reprint", "not_general"] },
        },
        required: ["isbn", "verdict"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

type Verdict = "new" | "reprint" | "not_general";

function listingLine(r: Release): string {
  return [
    r.isbn13,
    r.title,
    r.authors.join(", ") || "unknown",
    r.publisher ?? "",
    r.binding ?? "",
    r.page_count ?? "",
    r.date_published ?? "",
    r.subjects.slice(0, 3).join("; "),
  ].join(" | ");
}

interface Usage {
  input: number;
  cacheRead: number;
  output: number;
}

async function classifyBatch(batch: Release[], usage: Usage): Promise<Map<string, Verdict>> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: VERDICT_SCHEMA } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: batch.map(listingLine).join("\n") }],
  });

  usage.input += response.usage.input_tokens;
  usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
  usage.output += response.usage.output_tokens;

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`stopped: ${response.stop_reason}`);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text in response");

  const parsed = JSON.parse(text.text) as { results: { isbn: string; verdict: Verdict }[] };
  const wanted = new Set(batch.map((r) => r.isbn13));
  const verdicts = new Map<string, Verdict>();
  for (const { isbn, verdict } of parsed.results) {
    if (wanted.has(isbn)) verdicts.set(isbn, verdict);
  }
  return verdicts;
}

/**
 * Classify releases in batches. A release the model leaves out is asked about once
 * more, then kept: a stray junk book reaching the scorer costs less than losing a
 * new one. So is a batch the model refuses or answers unreadably. A batch whose API
 * request fails is left untriaged, to try again next run.
 */
async function classifyAll(releases: Release[], usage: Usage): Promise<{ verdicts: Map<string, Verdict>; failed: Set<string> }> {
  const verdicts = new Map<string, Verdict>();
  const failed = new Set<string>();
  const batches: Release[][] = [];
  for (let i = 0; i < releases.length; i += AI_BATCH_SIZE) batches.push(releases.slice(i, i + AI_BATCH_SIZE));

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        let result = await classifyBatch(batch, usage);
        const missing = batch.filter((r) => !result.has(r.isbn13));
        if (missing.length > 0) {
          const retry = await classifyBatch(missing, usage);
          result = new Map([...result, ...retry]);
        }
        for (const r of batch) verdicts.set(r.isbn13, result.get(r.isbn13) ?? "new");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof Anthropic.APIError) {
          // The API couldn't be reached or failed after retries: leave these for the next run
          console.log(`  AI check failed for ${batch.length} releases, leaving them untriaged: ${message}`);
          for (const r of batch) failed.add(r.isbn13);
        } else {
          // A refusal or unreadable answer won't change on a retry: keep the releases
          console.log(`  AI check gave no usable answer for ${batch.length} releases, keeping them: ${message}`);
          for (const r of batch) verdicts.set(r.isbn13, "new");
        }
      }
      done++;
      if (done % 5 === 0 || done === batches.length) console.log(`  AI check: ${done}/${batches.length} requests`);
    }
  };
  await Promise.all(Array.from({ length: AI_CONCURRENCY }, worker));
  return { verdicts, failed };
}

// --- Main ---

function targetMonth(): { year: number; month: number } {
  if (monthArg) {
    const [year, month] = monthArg.split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) {
      console.error(`Invalid --month: ${monthArg} (expected YYYY-MM)`);
      process.exit(1);
    }
    return { year, month };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

async function main() {
  const { year, month } = targetMonth();
  const label = `${year}-${String(month).padStart(2, "0")}`;
  console.log(`Rekollekt Release Triage`);
  console.log(`  Month: ${label} | Mode: ${dryRun ? "dry-run" : "live"}${rulesOnly ? " | rules only" : ` | AI: ${MODEL}`}`);

  // Every release in the month, so duplicate formats are judged against all of them
  const all = await fetchAllRows<Release>((from, to) =>
    supabase
      .from("new_releases")
      .select(
        "id, isbn13, title, authors, publisher, binding, page_count, date_published, subjects, synopsis, general_signal_score, triaged_at, skip_reason",
      )
      .eq("pub_year", year)
      .eq("pub_month", month)
      .order("id")
      .range(from, to),
  );

  // Which to triage: those dropped for the --redo reasons, every release for a dry
  // run or --force, otherwise the ones not yet triaged
  const pending = redo
    ? all.filter((r) => r.skip_reason && redo.includes(r.skip_reason))
    : dryRun || force
      ? all
      : all.filter((r) => !r.triaged_at);
  const pendingIds = new Set(pending.map((r) => r.id));
  // Books already kept, so a release triaged now doesn't become a second copy of one
  const keptWorks = new Set(
    all.filter((r) => !pendingIds.has(r.id) && r.triaged_at && !r.skip_reason).map(workKey),
  );
  console.log(`  Releases: ${all.length} | To triage: ${pending.length}${redo ? ` (redo: ${redo.join(", ")})` : ""}\n`);
  if (pending.length === 0) {
    console.log("Nothing to triage.");
    return;
  }

  const reasons = new Map<string, SkipReason>();
  for (const r of pending) {
    const reason = ruleReason(r);
    if (reason) reasons.set(r.id, reason);
  }
  markDuplicateFormats(pending, reasons, keptWorks);
  const afterRules = pending.filter((r) => !reasons.has(r.id));
  console.log(`Rules: dropped ${reasons.size}, ${afterRules.length} left`);

  // The AI check only looks at releases the scorer could score
  const forAi = afterRules.filter((r) => r.synopsis || r.subjects.length > 0);
  const usage: Usage = { input: 0, cacheRead: 0, output: 0 };
  let failed = new Set<string>();
  const verdicts = new Map<string, Verdict>();
  if (!rulesOnly && forAi.length > 0) {
    console.log(`AI check: ${forAi.length} releases in ${Math.ceil(forAi.length / AI_BATCH_SIZE)} requests`);
    const result = await classifyAll(forAi, usage);
    failed = result.failed;
    for (const r of forAi) {
      const verdict = result.verdicts.get(r.isbn13);
      if (verdict) verdicts.set(r.id, verdict);
      if (verdict === "reprint") reasons.set(r.id, "reprint");
      if (verdict === "not_general") reasons.set(r.id, "not_for_general_readers");
    }
    console.log(
      `AI check: ${[...verdicts.values()].filter((v) => v === "reprint").length} reprints, ` +
        `${[...verdicts.values()].filter((v) => v === "not_general").length} not for general readers` +
        (failed.size > 0 ? `, ${failed.size} not checked (request failed)` : ""),
    );
    console.log(`  Tokens: ${usage.input.toLocaleString()} input, ${usage.cacheRead.toLocaleString()} cached, ${usage.output.toLocaleString()} output`);
  }

  const counts = new Map<string, number>();
  for (const reason of reasons.values()) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const kept = pending.filter((r) => !reasons.has(r.id) && !failed.has(r.isbn13)).length;
  console.log(`\nKept ${kept} of ${pending.length}. Dropped:`);
  for (const [reason, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${reason}: ${n}`);

  if (reportPath) {
    const report = pending.map((r) => ({
      id: r.id,
      isbn13: r.isbn13,
      title: r.title,
      authors: r.authors,
      publisher: r.publisher,
      binding: r.binding,
      page_count: r.page_count,
      general_signal_score: r.general_signal_score,
      skip_reason: reasons.get(r.id) ?? null,
      previous_skip_reason: r.skip_reason,
      ai_verdict: verdicts.get(r.id) ?? null,
      untriaged: failed.has(r.isbn13),
    }));
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
  }

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  // Write: one update per reason, in chunks. Releases whose AI request failed stay untriaged.
  const triagedAt = new Date().toISOString();
  const groups = new Map<SkipReason | null, string[]>();
  for (const r of pending) {
    if (failed.has(r.isbn13)) continue;
    const reason = reasons.get(r.id) ?? null;
    groups.set(reason, [...(groups.get(reason) ?? []), r.id]);
  }
  let written = 0;
  for (const [reason, ids] of groups) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK);
      const { error } = await supabase
        .from("new_releases")
        .update({ triaged_at: triagedAt, skip_reason: reason })
        .in("id", chunk);
      if (error) throw new Error(`update failed (${reason ?? "kept"}): ${error.message}`);
      written += chunk.length;
    }
  }
  console.log(`\nTriaged ${written} releases.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
