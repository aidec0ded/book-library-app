import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

// --- Supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Types ---

interface Award {
  id: string;
  name: string;
  short_name: string;
  category: string;
  wikidata_id: string;
}

interface RawEntry {
  title: string;
  author: string;
  year: number | null;
  status: "winner" | "shortlist" | "longlist" | "nominee";
  wikidata_work_id: string;
}

interface AwardEntry {
  award_id: string;
  title: string;
  author: string;
  year: number | null;
  status: "winner" | "shortlist" | "longlist" | "nominee";
  wikidata_work_id: string;
}

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const matchOnly = args.includes("--match-only");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- Constants ---

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const RATE_LIMIT_MS = 2000;
const STATUS_RANK: Record<string, number> = {
  winner: 4,
  shortlist: 3,
  longlist: 2,
  nominee: 1,
};

// --- Helpers ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractQId(uri: string): string {
  const match = uri.match(/Q\d+$/);
  return match ? match[0] : uri;
}

/**
 * Build SPARQL queries for a given award. Returns two simpler queries
 * instead of one big UNION to avoid Wikidata timeouts:
 * 1. Winners query (P166 on work + P166 on author with P1686 qualifier)
 * 2. Nominees query (P1411 on work + P1411 on author with P1686 qualifier)
 */
function buildWinnersQuery(awardQId: string): string {
  return `
SELECT DISTINCT ?work ?workLabel ?authorLabel ?year WHERE {
  {
    ?work p:P166 ?stmt .
    ?stmt ps:P166 wd:${awardQId} .
    OPTIONAL { ?stmt pq:P585 ?time . }
  }
  UNION
  {
    ?person p:P166 ?stmt .
    ?stmt ps:P166 wd:${awardQId} .
    ?stmt pq:P1686 ?work .
    OPTIONAL { ?stmt pq:P585 ?time . }
  }
  OPTIONAL { ?work wdt:P50 ?author . }
  BIND(YEAR(?time) AS ?year)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
  `.trim();
}

function buildNomineesQuery(awardQId: string): string {
  return `
SELECT DISTINCT ?work ?workLabel ?authorLabel ?year ?detail WHERE {
  {
    ?work p:P1411 ?stmt .
    ?stmt ps:P1411 wd:${awardQId} .
    OPTIONAL { ?stmt pq:P585 ?time . }
    OPTIONAL { ?stmt pq:P1552 ?detail . }
  }
  UNION
  {
    ?person p:P1411 ?stmt .
    ?stmt ps:P1411 wd:${awardQId} .
    ?stmt pq:P1686 ?work .
    OPTIONAL { ?stmt pq:P585 ?time . }
    OPTIONAL { ?stmt pq:P1552 ?detail . }
  }
  OPTIONAL { ?work wdt:P50 ?author . }
  BIND(YEAR(?time) AS ?year)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
  `.trim();
}

async function querySparql(query: string): Promise<Record<string, unknown>[]> {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "Rekollekt/1.0 (book-library-app; literary-awards-ingestion)",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SPARQL query failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  return json.results.bindings;
}

// Q-IDs for shortlist/longlist qualifiers
const SHORTLIST_QID = "http://www.wikidata.org/entity/Q72996";
const LONGLIST_QID = "http://www.wikidata.org/entity/Q2892948";

function parseWinners(bindings: Record<string, unknown>[]): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const row of bindings) {
    const r = row as Record<string, { value: string } | undefined>;
    const workUri = r.work?.value;
    const title = r.workLabel?.value;
    if (!workUri || !title) continue;
    // Skip entries where label is just the Q-ID (no English label)
    if (/^Q\d+$/.test(title)) continue;

    const author = r.authorLabel?.value ?? "Unknown";
    const yearStr = r.year?.value;
    const year = yearStr ? parseInt(yearStr, 10) : null;

    entries.push({
      title,
      author: /^Q\d+$/.test(author) ? "Unknown" : author,
      year: year && !isNaN(year) ? year : null,
      status: "winner",
      wikidata_work_id: extractQId(workUri),
    });
  }
  return entries;
}

function parseNominees(bindings: Record<string, unknown>[]): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const row of bindings) {
    const r = row as Record<string, { value: string } | undefined>;
    const workUri = r.work?.value;
    const title = r.workLabel?.value;
    if (!workUri || !title) continue;
    if (/^Q\d+$/.test(title)) continue;

    const author = r.authorLabel?.value ?? "Unknown";
    const yearStr = r.year?.value;
    const year = yearStr ? parseInt(yearStr, 10) : null;
    const detailUri = r.detail?.value;

    let status: RawEntry["status"] = "nominee";
    if (detailUri === SHORTLIST_QID) status = "shortlist";
    else if (detailUri === LONGLIST_QID) status = "longlist";

    entries.push({
      title,
      author: /^Q\d+$/.test(author) ? "Unknown" : author,
      year: year && !isNaN(year) ? year : null,
      status,
      wikidata_work_id: extractQId(workUri),
    });
  }
  return entries;
}

function deduplicateEntries(entries: RawEntry[]): RawEntry[] {
  const best = new Map<string, RawEntry>();

  for (const entry of entries) {
    const key = entry.wikidata_work_id;
    const existing = best.get(key);
    if (!existing || (STATUS_RANK[entry.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
      best.set(key, entry);
    }
  }

  return Array.from(best.values());
}

// --- Title/Author normalization (matches discover-isbns.ts) ---

function normalizeTitle(title: string): string {
  let t = title.toLowerCase().trim();
  // strip leading articles
  t = t.replace(/^(the|a|an)\s+/i, "");
  // & → and
  t = t.replace(/&/g, "and");
  // strip parenthetical suffixes
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  // strip punctuation (keep alphanumeric and spaces)
  t = t.replace(/[^\w\s]/g, "");
  // collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function extractLastName(author: string): string {
  const name = author.toLowerCase().trim();
  const parts = name.split(/\s+/);
  return parts[parts.length - 1];
}

function normalizeAuthor(author: string): string {
  // split on common multi-author delimiters, take first
  const first = author.split(/\s+&\s+|,\s*/)[0].trim();
  return extractLastName(first);
}

// --- Main ---

async function main() {
  // Fetch awards from DB
  const { data: awards, error: awardsErr } = await supabase
    .from("literary_awards")
    .select("*")
    .order("name");

  if (awardsErr || !awards) {
    console.error("Failed to fetch awards:", awardsErr?.message);
    process.exit(1);
  }

  const awardList: Award[] = limit ? awards.slice(0, limit) : awards;

  console.log("Rekollekt Award Ingestion\n");
  console.log(`  Mode: ${dryRun ? "dry-run" : matchOnly ? "match-only" : "live"}`);
  console.log(`  Awards: ${awardList.length}`);
  if (force) console.log("  Force: re-fetching all from Wikidata");
  console.log();

  let totalEntries = 0;
  let totalNew = 0;
  let totalSkipped = 0;

  // --- Phase 1: Wikidata Ingestion ---

  if (!matchOnly) {
    for (let i = 0; i < awardList.length; i++) {
      const award = awardList[i];
      const label = `[${String(i + 1).padStart(2)}/` +
        `${String(awardList.length).padStart(2)}] ${award.name}`;

      // Check if award already has entries (skip unless --force)
      if (!force) {
        const { count } = await supabase
          .from("award_entries")
          .select("id", { count: "exact", head: true })
          .eq("award_id", award.id);

        if (count && count > 0) {
          console.log(`  ${label} — ${count} existing entries (skipped, use --force to re-fetch)`);
          totalSkipped += count;
          totalEntries += count;
          continue;
        }
      }

      process.stdout.write(`  ${label} — `);

      if (dryRun) {
        console.log("(dry-run, skipping SPARQL query)");
        await sleep(100);
        continue;
      }

      try {
        // Query winners and nominees separately to avoid Wikidata timeouts
        const winnersBindings = await querySparql(buildWinnersQuery(award.wikidata_id));
        await sleep(RATE_LIMIT_MS);
        const nomineesBindings = await querySparql(buildNomineesQuery(award.wikidata_id));

        const raw = [
          ...parseWinners(winnersBindings),
          ...parseNominees(nomineesBindings),
        ];
        const deduped = deduplicateEntries(raw);

        // Upsert entries
        let newCount = 0;
        let existingCount = 0;

        for (const entry of deduped) {
          // Check if entry already exists by (award_id, wikidata_work_id)
          const { data: existing } = await supabase
            .from("award_entries")
            .select("id, status")
            .eq("award_id", award.id)
            .eq("wikidata_work_id", entry.wikidata_work_id)
            .maybeSingle();

          if (existing) {
            // Update if higher-rank status
            const existingRank = STATUS_RANK[existing.status] ?? 0;
            const newRank = STATUS_RANK[entry.status] ?? 0;
            if (newRank > existingRank) {
              await supabase
                .from("award_entries")
                .update({ status: entry.status, year: entry.year, title: entry.title, author: entry.author })
                .eq("id", existing.id);
            }
            existingCount++;
          } else {
            const row: AwardEntry = {
              award_id: award.id,
              title: entry.title,
              author: entry.author,
              year: entry.year,
              status: entry.status,
              wikidata_work_id: entry.wikidata_work_id,
            };

            const { error: insertErr } = await supabase
              .from("award_entries")
              .insert(row);

            if (insertErr) {
              console.error(`\n    Insert error for "${entry.title}": ${insertErr.message}`);
            } else {
              newCount++;
            }
          }
        }

        console.log(
          `${deduped.length} entries (${newCount} new, ${existingCount} existing)`
        );
        totalEntries += deduped.length;
        totalNew += newCount;
      } catch (err) {
        console.log(`ERROR: ${(err as Error).message}`);
      }

      // Rate limit between awards
      if (i < awardList.length - 1) {
        await sleep(RATE_LIMIT_MS);
      }
    }

    if (dryRun) {
      console.log(
        `\nDry run complete. Would query ${awardList.length} awards from Wikidata.\n`
      );
      return;
    }

    console.log();
  }

  // --- Phase 2: Library Matching ---

  console.log("Matching against library...\n");

  // Fetch all unmatched entries (paginate past Supabase 1000-row limit)
  const unmatched: { id: string; award_id: string; title: string; author: string }[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("award_entries")
        .select("id, award_id, title, author")
        .is("book_id", null)
        .range(offset, offset + PAGE - 1);
      if (err) {
        console.error("Failed to fetch unmatched entries:", err.message);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      unmatched.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  // Fetch all books (paginate)
  const books: { id: string; title: string; author: string }[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("books")
        .select("id, title, author")
        .range(offset, offset + PAGE - 1);
      if (err) {
        console.error("Failed to fetch books:", err.message);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      books.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  console.log(`  ${unmatched.length} unmatched entries, ${books.length} books in library\n`);

  // Build lookup map: normalizedTitle|normalizedAuthorLastName → book_id
  const bookMap = new Map<string, string>();
  for (const book of books) {
    const key = `${normalizeTitle(book.title)}|${normalizeAuthor(book.author)}`;
    bookMap.set(key, book.id);
  }

  // Match per award
  const matchStats = new Map<string, { matched: number; unmatched: number }>();
  let totalMatched = 0;

  for (const entry of unmatched) {
    const key = `${normalizeTitle(entry.title)}|${normalizeAuthor(entry.author)}`;
    const bookId = bookMap.get(key);

    const awardId = entry.award_id;
    if (!matchStats.has(awardId)) {
      matchStats.set(awardId, { matched: 0, unmatched: 0 });
    }

    if (bookId) {
      if (!dryRun) {
        await supabase
          .from("award_entries")
          .update({ book_id: bookId })
          .eq("id", entry.id);
      }
      matchStats.get(awardId)!.matched++;
      totalMatched++;
    } else {
      matchStats.get(awardId)!.unmatched++;
    }
  }

  // Print per-award stats
  const awardMap = new Map(awardList.map((a) => [a.id, a]));
  // Also fetch all awards for display (in case --match-only)
  const { data: allAwards } = await supabase
    .from("literary_awards")
    .select("id, name, short_name")
    .order("name");

  const displayAwards = allAwards ?? awardList;
  const awardDisplayMap = new Map(displayAwards.map((a) => [a.id, a]));

  for (const [awardId, stats] of matchStats) {
    const award = awardDisplayMap.get(awardId) ?? awardMap.get(awardId);
    const name = award?.name ?? awardId;
    const padded = name.padEnd(48);
    console.log(
      `  ${padded} ${String(stats.matched).padStart(3)} matched, ${String(stats.unmatched).padStart(4)} unmatched`
    );
  }

  // Summary
  console.log(`\n--- Summary ---`);
  if (!matchOnly) {
    console.log(`  Total entries: ${totalEntries.toLocaleString()}`);
    console.log(`  New:           ${totalNew.toLocaleString()}`);
    console.log(`  Skipped:       ${totalSkipped.toLocaleString()}`);
  }
  console.log(`  Matched:       ${totalMatched}`);
  console.log(`  Unmatched:     ${unmatched.length - totalMatched}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
