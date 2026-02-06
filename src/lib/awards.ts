import { supabase } from "@/lib/supabase";

export interface BookAward {
  id: string;
  award_name: string;
  award_short_name: string;
  year: number | null;
  status: string; // 'winner' | 'shortlist' | 'longlist' | 'nominee'
}

export async function fetchAwardsForBook(bookId: string): Promise<BookAward[]> {
  const { data, error } = await supabase
    .from("award_entries")
    .select(`
      id,
      year,
      status,
      literary_awards!inner (
        name,
        short_name
      )
    `)
    .eq("book_id", bookId)
    .order("year", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const award = row.literary_awards as { name: string; short_name: string };
    return {
      id: row.id as string,
      award_name: award.name,
      award_short_name: award.short_name,
      year: row.year as number | null,
      status: row.status as string,
    };
  });
}
