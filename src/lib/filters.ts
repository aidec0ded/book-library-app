import { supabase } from "@/lib/supabase";

export async function fetchDistinctGenres(): Promise<string[]> {
  const { data, error } = await supabase
    .from("books")
    .select("genre")
    .not("genre", "is", null);

  if (error) throw error;

  const unique = [...new Set(data.map((row) => row.genre as string))];
  unique.sort();
  return unique;
}
