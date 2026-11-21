/**
 * The key a title sorts by, as shelves and catalogs file it: a leading "A", "An", or "The"
 * is skipped (A Clash of Kings files under C), and so is leading punctuation ('Salem's Lot
 * files under S). The same rule as the books table's `sort_title` column (migration 042).
 */
export function sortTitle(title: string): string {
  return title
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^(the|an?)\s+/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "");
}

/** Compares two titles by their sort keys, for sorting in the browser. */
export function compareTitles(a: string, b: string): number {
  return sortTitle(a).localeCompare(sortTitle(b));
}
