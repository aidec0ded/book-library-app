/**
 * Which new releases the scorer scores: triaged and kept by scripts/triage-releases.ts,
 * with a synopsis or subjects to judge from.
 *
 * The scorer selects with this filter and the releases scheduler counts with it,
 * so they always agree. When they didn't, a month whose only unscored releases
 * had nothing to judge looked unfinished forever: the scheduler started a scoring
 * run every 4 hours that scored nothing, and never moved on to the next month or
 * to other readers.
 */

/** Has a synopsis or subjects. The import stores a blank synopsis as null. */
export const HAS_SOMETHING_TO_JUDGE = "synopsis.not.is.null,subjects.neq.{}";

interface FilterBuilder<Q> {
  or(filters: string, options?: { referencedTable?: string }): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
}

/**
 * Narrow a new_releases query to the releases the scorer scores. Pass
 * `referencedTable: "new_releases"` when filtering through a join.
 */
export function scorableOnly<Q extends FilterBuilder<Q>>(query: Q, referencedTable?: string): Q {
  const column = (name: string) => (referencedTable ? `${referencedTable}.${name}` : name);
  return query
    .or(HAS_SOMETHING_TO_JUDGE, referencedTable ? { referencedTable } : undefined)
    .not(column("triaged_at"), "is", null)
    .is(column("skip_reason"), null);
}
