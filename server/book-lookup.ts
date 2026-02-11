import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find a book by title with multi-stage fallback.
 *
 * The AI sees exact titles in the library index but sometimes passes
 * slight variations (added subtitles, stripped colons, etc.) to tool
 * handlers. This function tries progressively fuzzier matching:
 *
 * 1. Exact case-insensitive match
 * 2. Contains match (DB title contains the search term)
 * 3. Base title match (strip subtitle after colon/dash and retry exact)
 */
export async function findBookByTitle<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  title: string,
  select = "id, title",
): Promise<(T & { id: string; title: string }) | null> {
  // Escape LIKE wildcards in the title itself
  const escaped = title.replace(/%/g, "\\%").replace(/_/g, "\\_");

  // 1. Exact match (case-insensitive)
  const { data: exact, error: e1 } = await supabase
    .from("books")
    .select(select)
    .ilike("title", escaped)
    .limit(1)
    .maybeSingle();

  if (e1) throw e1;
  if (exact) return exact as unknown as T & { id: string; title: string };

  // 2. Contains match — DB title contains the search term
  const { data: contains, error: e2 } = await supabase
    .from("books")
    .select(select)
    .ilike("title", `%${escaped}%`)
    .limit(1)
    .maybeSingle();

  if (e2) throw e2;
  if (contains) return contains as unknown as T & { id: string; title: string };

  // 3. Base title — strip subtitle (after colon, em-dash, or en-dash)
  const base = title.split(/\s*[:\u2014\u2013]\s*/)[0].trim();
  if (base && base.length > 2 && base !== title) {
    const escapedBase = base.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: stripped, error: e3 } = await supabase
      .from("books")
      .select(select)
      .ilike("title", escapedBase)
      .limit(1)
      .maybeSingle();

    if (e3) throw e3;
    if (stripped) return stripped as unknown as T & { id: string; title: string };
  }

  return null;
}
