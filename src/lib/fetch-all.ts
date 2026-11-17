const PAGE = 1000;

/**
 * Every row of a query, page by page. Supabase returns at most 1,000 rows per request,
 * with no error, so a single request silently cuts off a large library.
 * `page(from, to)` builds the query with `.range(from, to)` and a stable order.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
