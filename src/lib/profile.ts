import { supabase } from "@/lib/supabase";
import type { Book, ReaderProfile } from "@/lib/types";

export async function fetchLatestProfile(): Promise<ReaderProfile | null> {
  const { data, error } = await supabase
    .from("reader_profile")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchBooksByIds(bookIds: string[]): Promise<Book[]> {
  if (bookIds.length === 0) return [];

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .in("id", bookIds);

  if (error) throw error;

  // Preserve order from bookIds array
  const bookMap = new Map((data ?? []).map((b) => [b.id, b]));
  return bookIds.map((id) => bookMap.get(id)).filter(Boolean) as Book[];
}

export async function updatePersonalCanon(
  profileId: string,
  bookIds: string[],
): Promise<void> {
  // Read current profile data
  const { data, error: readError } = await supabase
    .from("reader_profile")
    .select("profile_data")
    .eq("id", profileId)
    .single();

  if (readError) throw readError;

  // Update personal_canon in profile_data
  const updatedData = { ...data.profile_data, personal_canon: bookIds };

  const { error: updateError } = await supabase
    .from("reader_profile")
    .update({ profile_data: updatedData })
    .eq("id", profileId);

  if (updateError) throw updateError;
}
