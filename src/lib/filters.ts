import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";

export async function fetchDistinctGenres(): Promise<string[]> {
  const data = await fetchAllRows<{ genre: string | null }>((from, to) =>
    supabase.from("books").select("genre").not("genre", "is", null).order("id").range(from, to),
  );

  const unique = [...new Set(data.map((row) => row.genre as string))];
  unique.sort();
  return unique;
}
