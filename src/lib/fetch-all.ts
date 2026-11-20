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

/**
 * Every row matching a list of ids too long for one request: a long `in` list makes the
 * request URL too long for the server, so the ids go in chunks, each read page by page.
 */
export async function fetchAllRowsIn<T>(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 150,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    rows.push(...(await fetchAllRows<T>((from, to) => page(chunk, from, to))));
  }
  return rows;
}
