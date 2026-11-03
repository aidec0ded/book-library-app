// Pure edition and matching logic, shared by the browser, chat server, and scripts.
// Keep this file free of imports so all three can load it.

// --- Types ---

export interface ISBNdbBook {
  title: string;
  title_long?: string;
  isbn?: string;
  isbn13?: string;
  authors?: string[];
  image?: string;
  publisher?: string;
  date_published?: string;
  binding?: string;
  pages?: number;
  synopsis?: string;
  overview?: string;
  subjects?: string[];
  language?: string;
  edition?: string;
}

export interface BookInsert {
  title: string;
  author: string;
  isbn: string | null;
  book_type: "fiction" | "nonfiction" | "poetry";
  cover_image_url: string | null;
  publisher: string | null;
  publication_year: number | null;
  page_count: number | null;
  format: string | null;
  summary: string | null;
  status: string;
  isbndb_enriched_at: string;
  is_favorite: boolean;
  is_up_next: boolean;
}

// --- Helpers ---

function parseYear(dateStr: string): number | null {
  const match = dateStr.match(/((?:19|20)\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

// --- Languages ---

// ISBNdb mixes codes ("eng", "en", "en_US") and leaves many blank
const ISO3_TO_ISO2: Record<string, string> = {
  ara: "ar", cat: "ca", ces: "cs", chi: "zh", cze: "cs", dan: "da", deu: "de",
  dut: "nl", ell: "el", eng: "en", fin: "fi", fra: "fr", fre: "fr", ger: "de",
  gre: "el", heb: "he", hin: "hi", hun: "hu", ita: "it", jpn: "ja", kor: "ko",
  nld: "nl", nor: "no", pol: "pl", por: "pt", ron: "ro", rum: "ro", rus: "ru",
  spa: "es", swe: "sv", tur: "tr", ukr: "uk", zho: "zh",
};

export function languageCode(raw?: string | null): string | null {
  const primary = raw?.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return null;
  return ISO3_TO_ISO2[primary] ?? primary;
}

export function preferredLanguage(): string {
  const browser = typeof navigator !== "undefined" ? navigator.language : null;
  return languageCode(browser) ?? "en";
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// --- Formats ---

export type FormatCategory = "hardcover" | "paperback" | "ebook" | "audiobook" | "other";

export const FORMAT_OPTIONS = [
  "Hardcover",
  "Paperback",
  "Mass Market Paperback",
  "eBook",
  "Audiobook",
  "Audio CD",
] as const;

// ISBNdb bindings vary in case and wording ("hardcover", "audioCD", "digital_audiobook")
export function normalizeFormat(binding?: string | null): string | null {
  const raw = binding?.trim();
  if (!raw) return null;
  const b = raw.toLowerCase();
  if (b.includes("mass market")) return "Mass Market Paperback";
  if (/hard\s?(cover|back)/.test(b)) return "Hardcover";
  if (/paperback|soft\s?cover|softback/.test(b)) return "Paperback";
  if (/audio\s?cd|mp3\s?cd/.test(b)) return "Audio CD";
  if (/audio/.test(b)) return "Audiobook";
  if (/e-?book|kindle|epub|digital/.test(b)) return "eBook";
  return raw;
}

export function formatCategory(binding?: string | null): FormatCategory {
  switch (normalizeFormat(binding)) {
    case "Hardcover":
      return "hardcover";
    case "Paperback":
    case "Mass Market Paperback":
      return "paperback";
    case "eBook":
      return "ebook";
    case "Audiobook":
    case "Audio CD":
      return "audiobook";
    default:
      return "other";
  }
}

// Audio listings report placeholder page counts (e.g. 1 for a CD set)
export function editionPages(book: ISBNdbBook): number | null {
  if (!book.pages || book.pages <= 0) return null;
  return formatCategory(book.binding) === "audiobook" ? null : book.pages;
}

export function editionYear(book: ISBNdbBook): number | null {
  return book.date_published ? parseYear(book.date_published) : null;
}

// --- Edition grouping ---

export interface EditionGroup {
  key: string;
  best: ISBNdbBook;
  editions: ISBNdbBook[];
}

const NAME_PARTICLES = /^(de|del|della|der|di|du|la|le|st|van|von)\s/;

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ISBNdb lists one person as both "Andy Weir" and "Weir, Andy", and a stored
 * author may be a comma-joined list. Reduce to the first author's name tokens,
 * sorted, so word order doesn't matter.
 */
function normalizeAuthorKey(author?: string | null): string {
  const raw = (author ?? "").replace(/\b\d{4}\b|-/g, " ");
  const [first, second] = raw.split(",").map(normalizeText).filter(Boolean);
  if (!first) return "unknown";

  let name = first;
  if (second) {
    const isSurnameFirst = !first.includes(" ") || NAME_PARTICLES.test(`${first} `);
    if (isSurnameFirst && !/^(jr|sr|ii|iii|iv)$/.test(second)) {
      name = `${first} ${second}`;
    }
  }

  // Treat "J. R. R." and "JRR" alike by joining runs of initials
  const tokens: string[] = [];
  let initials = "";
  for (const token of name.split(" ")) {
    if (/^(jr|sr|ii|iii|iv)$/.test(token)) continue;
    if (token.length === 1) {
      initials += token;
      continue;
    }
    if (initials) tokens.push(initials);
    initials = "";
    tokens.push(token);
  }
  if (initials) tokens.push(initials);
  return tokens.sort().join(" ") || "unknown";
}

// A subtitle starts at a colon, bracket, or spaced dash ("Catch-22" keeps its hyphen)
const SUBTITLE_RE = /(\s*[:(\[]|\s+[-\u2013\u2014]\s+).*$/;

function normalizeWorkTitle(title: string): string {
  let t = title.toLowerCase().replace(/&/g, " and ");
  // Remove subtitles and parentheticals
  t = t.replace(SUBTITLE_RE, "").trim();
  // Strip bare genre/format suffixes ("Good Material A novel" → "Good Material")
  t = t
    .replace(
      /\s+a\s+(?:novel|memoir|novella|story|thriller|romance|mystery)(?:\s.*)?$/i,
      "",
    )
    .trim();
  // Strip trailing articles ("Great Gatsby, The" → "Great Gatsby")
  t = t.replace(/,\s*(the|a|an)$/i, "").trim();
  // Strip leading articles
  t = t.replace(/^(the|a|an)\s+/i, "").trim();
  return normalizeText(t);
}

function normalizeWorkKey(title: string, author?: string | null): string {
  return `${normalizeWorkTitle(title)}|${normalizeAuthorKey(author)}`;
}

export function isSameWork(
  a: { title: string; author?: string | null },
  b: { title: string; author?: string | null },
): boolean {
  return normalizeWorkKey(a.title, a.author) === normalizeWorkKey(b.title, b.author);
}

/** The title without its subtitle, for searching by work. */
export function baseTitle(title: string): string {
  return title.replace(SUBTITLE_RE, "").trim() || title;
}

// Study guides, summaries, and box sets share a title with the book itself
const NON_EDITION_RE =
  /\b(summary|study guide|supersummary|analysis of|workbook|sparknotes|box(ed)? set|collection set|\d[- ]book|books? collection|trilogy set)\b/i;

export function isLikelyNonEdition(book: ISBNdbBook): boolean {
  return NON_EDITION_RE.test(`${book.title} ${book.authors?.join(" ") ?? ""}`);
}

function languageRank(book: ISBNdbBook, preferred: string): number {
  const code = languageCode(book.language);
  if (code === preferred) return 0;
  return code === null ? 1 : 2;
}

export function editionScore(book: ISBNdbBook, preferred: string): number {
  let score = 0;
  const language = languageRank(book, preferred);
  if (language === 0) score += 20;
  else if (language === 1) score += 5;
  if (isLikelyNonEdition(book)) score -= 30;
  if (book.image) score += 10;
  if (book.synopsis || book.overview) score += 3;
  if (editionPages(book)) score += 2;
  if (book.publisher) score += 1;
  const category = formatCategory(book.binding);
  if (category === "hardcover") score += 5;
  else if (category === "paperback") score += 4;
  else if (category === "ebook") score += 1;
  // Prefer an edition that's actually out over an upcoming one
  const year = editionYear(book);
  if (year && year > new Date().getFullYear()) score -= 2;
  return score;
}

/** Your language first, then blanks, then the rest; oldest first within each. */
export function sortEditions(
  editions: ISBNdbBook[],
  preferred = preferredLanguage(),
): ISBNdbBook[] {
  return [...editions].sort((a, b) => {
    const nonEdition = Number(isLikelyNonEdition(a)) - Number(isLikelyNonEdition(b));
    if (nonEdition !== 0) return nonEdition;
    const language = languageRank(a, preferred) - languageRank(b, preferred);
    if (language !== 0) return language;
    return (editionYear(a) ?? 9999) - (editionYear(b) ?? 9999);
  });
}

export function editionYearRange(editions: ISBNdbBook[]): string | null {
  const years = editions
    .filter((e) => !isLikelyNonEdition(e))
    .map(editionYear)
    .filter((y): y is number => y !== null);
  if (years.length === 0) return null;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

export function groupEditions(
  books: ISBNdbBook[],
  query?: string,
  preferred = preferredLanguage(),
): EditionGroup[] {
  const groups = new Map<string, ISBNdbBook[]>();

  for (const book of books) {
    const key = normalizeWorkKey(book.title, book.authors?.[0]);
    const existing = groups.get(key);
    if (existing) {
      existing.push(book);
    } else {
      groups.set(key, [book]);
    }
  }

  // Listings with no author join the largest same-titled group
  for (const [key, editions] of groups) {
    const [title, author] = key.split("|");
    if (author !== "unknown") continue;
    let target: ISBNdbBook[] | null = null;
    for (const [otherKey, other] of groups) {
      if (otherKey === key || otherKey.split("|")[0] !== title) continue;
      if (!target || other.length > target.length) target = other;
    }
    if (target) {
      target.push(...editions);
      groups.delete(key);
    }
  }

  const result: EditionGroup[] = [];
  for (const [key, editions] of groups) {
    editions.sort((a, b) => editionScore(b, preferred) - editionScore(a, preferred));
    result.push({ key, best: editions[0], editions });
  }

  // Author matches first (helps when searching by author name), then the
  // works with the most editions; study guides and box sets sink to the end
  const q = query?.toLowerCase().trim();
  const authorMatch = (group: EditionGroup) =>
    q &&
    group.best.authors?.some(
      (auth) => auth.toLowerCase().includes(q) || q.includes(auth.toLowerCase()),
    )
      ? 1
      : 0;
  result.sort(
    (a, b) =>
      Number(isLikelyNonEdition(a.best)) - Number(isLikelyNonEdition(b.best)) ||
      authorMatch(b) - authorMatch(a) ||
      b.editions.length - a.editions.length,
  );

  return result;
}

/** Find the editions of one book within a set of search results. */
export function findWorkEditions(
  books: ISBNdbBook[],
  title: string,
  author?: string | null,
): ISBNdbBook[] {
  const groups = groupEditions(books);
  const exact = groups.find((g) => g.key === normalizeWorkKey(title, author));
  if (exact) return exact.editions;
  // Stored author may be spelled differently — fall back to the largest
  // group with this title, excluding study guides and the like
  const workTitle = normalizeWorkTitle(title);
  return (
    groups.find(
      (g) => g.key.split("|")[0] === workTitle && !isLikelyNonEdition(g.best),
    )?.editions ?? []
  );
}

// --- Matching a requested book ---

function normalizeFullTitle(title: string): string {
  const t = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/,\s*(the|a|an)\s*$/i, "")
    .replace(/^(the|a|an)\s+/i, "");
  return normalizeText(t);
}

/**
 * How closely two titles name the same book, ignoring punctuation and case:
 * 3 identical, 2 same before any subtitle, 1 one continues the other (for
 * subtitles with no colon: "Being You" / "Being You A New Science..."), 0 no match.
 */
export function compareTitles(a: string, b: string): 0 | 1 | 2 | 3 {
  const fullA = normalizeFullTitle(a);
  const fullB = normalizeFullTitle(b);
  if (!fullA || !fullB) return 0;
  if (fullA === fullB) return 3;

  // "Super Powereds: Year 1" and "Year 2" share a title but are different books
  const numbersA: string[] = fullA.match(/\d+/g) ?? [];
  const numbersB: string[] = fullB.match(/\d+/g) ?? [];
  if (
    numbersA.length > 0 &&
    numbersB.length > 0 &&
    !numbersA.every((n) => numbersB.includes(n)) &&
    !numbersB.every((n) => numbersA.includes(n))
  ) {
    return 0;
  }

  const workA = normalizeWorkTitle(a);
  const workB = normalizeWorkTitle(b);
  if (workA && workA === workB) return 2;

  const continues = (shorter: string, longer: string) =>
    shorter.includes(" ") && longer.startsWith(`${shorter} `);
  if (
    continues(workA, fullB) ||
    continues(workB, fullA) ||
    continues(fullA, fullB) ||
    continues(fullB, fullA)
  ) {
    return 1;
  }
  return 0;
}

function nameTokens(name: string): string[] {
  const tokens: string[] = [];
  let initials = "";
  for (const token of normalizeText(name).split(" ")) {
    if (!token || /^(jr|sr|ii|iii|iv)$/.test(token)) continue;
    if (token.length === 1) {
      initials += token;
      continue;
    }
    if (initials) tokens.push(initials);
    initials = "";
    tokens.push(token);
  }
  if (initials) tokens.push(initials);
  return tokens;
}

/** Split an author field into people, keeping "Weir, Andy" as one person. */
function authorNames(author: string): string[][] {
  const cleaned = author.replace(/\b\d{4}\b/g, " ");
  const [first, second, ...rest] = cleaned.split(",").map((p) => p.trim());
  if (
    first &&
    second &&
    rest.length === 0 &&
    (nameTokens(first).length === 1 || NAME_PARTICLES.test(`${normalizeText(first)} `)) &&
    !/^(jr|sr|ii|iii|iv)\.?$/i.test(second)
  ) {
    return [nameTokens(`${first} ${second}`)];
  }
  return cleaned
    .split(/,|;|&|\band\b/i)
    .map(nameTokens)
    .filter((tokens) => tokens.length > 0);
}

function sameName(a: string[], b: string[]): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((token) => longer.includes(token));
}

/** True or false when both authors are known; null when either is missing. */
export function authorsCompatible(a?: string | null, b?: string | null): boolean | null {
  const isKnown = (author?: string | null) =>
    !!author && normalizeText(author) !== "" && normalizeText(author) !== "unknown";
  if (!isKnown(a) || !isKnown(b)) return null;
  const namesA = authorNames(a!);
  const namesB = authorNames(b!);
  return namesA.some((x) => namesB.some((y) => sameName(x, y)));
}

/**
 * Find the book being asked for in a set of library rows. Different author means
 * a different book ("Twisted" by Cavanagh isn't "Twisted" by McIntire). With no
 * author to compare, require more than a partial title match. Prefers a book the
 * reader owns over a wishlist entry.
 */
export function findBestLibraryMatch<T extends { title: string; author?: string | null; status?: string | null }>(
  title: string,
  author: string | null | undefined,
  candidates: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const titleRank = compareTitles(title, candidate.title);
    if (titleRank === 0) continue;
    const authorMatch = authorsCompatible(author, candidate.author);
    if (authorMatch === false) continue;
    if (authorMatch === null && titleRank < 2) continue;

    // Owning a copy outweighs a closer title on a wishlist entry
    const score =
      (candidate.status === "wishlist" ? 0 : 100) + titleRank * 10 + (authorMatch ? 5 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** A same-titled library book by a different author, in case the author is spelled differently ("Lao Tzu" / "Laozi"). */
export function findSameTitleOtherAuthor<T extends { title: string; author?: string | null }>(
  title: string,
  author: string | null | undefined,
  candidates: T[],
): T | null {
  return (
    candidates.find(
      (c) => compareTitles(title, c.title) >= 2 && authorsCompatible(author, c.author) === false,
    ) ?? null
  );
}

/** A LIKE pattern to narrow a library down to rows that might match a title. */
export function libraryTitlePattern(title: string): string {
  const words = normalizeWorkTitle(title)
    .split(" ")
    .filter(Boolean)
    // "and" may be stored as "&"
    .filter((word) => word !== "and")
    .slice(0, 3)
    // Letters that can carry accents match as wildcards, so "Mobius" finds "M\u00f6bius".
    // This only narrows the rows; findBestLibraryMatch decides what matches.
    .map((word) => word.replace(/[^a-z0-9]|[aeiouync]/g, "_"));
  return words.length > 0 ? `%${words.join("%")}%` : `%${title.replace(/[\\%_]/g, "\\$&")}%`;
}

/** The listings in a search result that are editions of the requested book. */
export function findMatchingEditions(
  title: string,
  author: string | null | undefined,
  books: ISBNdbBook[],
): ISBNdbBook[] {
  return books.filter((book) => {
    if (isLikelyNonEdition(book)) return false;
    const titleRank = compareTitles(title, book.title);
    if (titleRank === 0) return false;
    const authorMatch = book.authors?.length
      ? book.authors.some((a) => authorsCompatible(author, a) === true)
        ? true
        : authorsCompatible(author, book.authors.join(", "))
      : null;
    if (authorMatch === false) return false;
    return authorMatch === true || titleRank >= 2;
  });
}

/** The likeliest edition to represent a book: complete, in the reader's language, original on ties. */
export function pickBestEdition(
  editions: ISBNdbBook[],
  preferred = preferredLanguage(),
): ISBNdbBook | null {
  const sorted = [...editions].sort(
    (a, b) =>
      editionScore(b, preferred) - editionScore(a, preferred) ||
      (editionYear(a) ?? 9999) - (editionYear(b) ?? 9999),
  );
  return sorted[0] ?? null;
}

// --- Book type detection ---

const POETRY_SUBJECT_RE = /\bpoetry\b|\bpoems\b|\bverse\b/i;
const FICTION_SUBJECT_RE =
  /\bfiction\b|\bnovel\b|\bthriller\b|\bmystery\b|\bromance\b|\bfantasy\b|\bsci-fi\b|\bscience fiction\b|\bhorror\b|\bsuspense\b|\bdetective\b/i;

export function detectBookType(
  subjects?: string[],
): "fiction" | "nonfiction" | "poetry" {
  if (!subjects || subjects.length === 0) return "fiction";
  if (subjects.some((s) => POETRY_SUBJECT_RE.test(s))) return "poetry";
  if (subjects.some((s) => FICTION_SUBJECT_RE.test(s))) return "fiction";
  return "nonfiction";
}

// --- Mapping ---

export function mapToBookInsert(book: ISBNdbBook, status: string): BookInsert {
  const isbn = book.isbn13 || book.isbn || null;
  const author = book.authors?.join(", ") ?? "Unknown";

  let summary: string | null = null;
  const synopsis = book.synopsis ? stripHtml(book.synopsis) : "";
  const overview = book.overview ? stripHtml(book.overview) : "";
  const text = synopsis || overview;
  if (text) summary = text;

  let publicationYear: number | null = null;
  if (book.date_published) {
    publicationYear = parseYear(book.date_published);
  }

  const pageCount = editionPages(book);
  const publisher = book.publisher?.trim() || null;
  const format = normalizeFormat(book.binding);

  return {
    title: book.title,
    author,
    isbn,
    book_type: detectBookType(book.subjects),
    cover_image_url: book.image || null,
    publisher,
    publication_year: publicationYear,
    page_count: pageCount,
    format,
    summary,
    status,
    isbndb_enriched_at: new Date().toISOString(),
    is_favorite: false,
    is_up_next: false,
  };
}

/** The fields that describe a specific edition, for switching a library book to it. */
export function mapToEditionFields(book: ISBNdbBook, existing: { summary: string | null }) {
  const mapped = mapToBookInsert(book, "unread");
  return {
    isbn: mapped.isbn,
    publisher: mapped.publisher,
    publication_year: mapped.publication_year,
    page_count: mapped.page_count,
    format: mapped.format,
    isbndb_enriched_at: mapped.isbndb_enriched_at,
    // Keep the current cover and summary when this edition has none to offer
    ...(mapped.cover_image_url && { cover_image_url: mapped.cover_image_url }),
    ...(!existing.summary && mapped.summary && { summary: mapped.summary }),
  };
}
