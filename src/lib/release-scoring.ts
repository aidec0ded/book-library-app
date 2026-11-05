/**
 * Which new releases the scorer can judge: those with a synopsis or subjects.
 *
 * The scorer selects with this filter and the releases scheduler counts with it,
 * so they always agree. When they didn't, a month whose only unscored releases
 * had nothing to judge looked unfinished forever: the scheduler started a scoring
 * run every 4 hours that scored nothing, and never moved on to the next month or
 * to other readers.
 *
 * Use with `.or(SCORABLE_RELEASES)`, or `.or(SCORABLE_RELEASES, { referencedTable: "new_releases" })`
 * when filtering through a join. The import stores a blank synopsis as null, so
 * "not null" means it has text.
 */
export const SCORABLE_RELEASES = "synopsis.not.is.null,subjects.neq.{}";
