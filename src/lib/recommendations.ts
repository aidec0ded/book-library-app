import { supabase } from "@/lib/supabase";
import { fetchCanonicalVibesForBooks } from "@/lib/vibes";
import { getCurrentTiming } from "@/lib/timing";
import type { Book } from "@/lib/types";

export type RecommendedBook = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "cover_image_url"
  | "status"
  | "predicted_rating"
  | "timing_month"
  | "timing_position"
  | "created_at"
>;

export async function fetchRecommendations(
  limit: number,
): Promise<RecommendedBook[]> {
  const timing = getCurrentTiming();

  // Step 1: Reader's vibe profile — canonical vibes from books rated ≥ 4
  const { data: ratedBooks } = await supabase
    .from("books")
    .select("id")
    .gte("rating", 4);

  const ratedIds = ratedBooks?.map((b) => b.id) ?? [];
  let topVibes: string[] = [];

  if (ratedIds.length > 0) {
    const ratedVibesMap = await fetchCanonicalVibesForBooks(ratedIds);
    const vibeCounts = new Map<string, number>();
    for (const vibes of ratedVibesMap.values()) {
      for (const v of vibes) {
        vibeCounts.set(v, (vibeCounts.get(v) ?? 0) + 1);
      }
    }
    topVibes = Array.from(vibeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vibe]) => vibe);
  }

  // Step 2: Candidate books — unread with predicted rating
  const { data: candidates } = await supabase
    .from("books")
    .select(
      "id, title, author, cover_image_url, status, predicted_rating, timing_month, timing_position, created_at",
    )
    .eq("status", "unread")
    .not("predicted_rating", "is", null)
    .order("predicted_rating", { ascending: false })
    .limit(100);

  if (!candidates || candidates.length === 0) return [];

  // Step 3: Candidate vibes
  const candidateIds = candidates.map((b) => b.id);
  const candidateVibes = await fetchCanonicalVibesForBooks(candidateIds);

  // Step 4: Score each candidate
  const scored = candidates.map((book) => {
    let score = book.predicted_rating ?? 0;

    // Seasonal boost
    if (book.timing_month === timing.month) {
      score += 0.3;
      if (book.timing_position === timing.position) {
        score += 0.1;
      }
    }

    // Vibe boost
    if (topVibes.length > 0) {
      const bookVibes = candidateVibes.get(book.id) ?? [];
      let vibeBoost = 0;
      for (const v of bookVibes) {
        if (topVibes.includes(v)) {
          vibeBoost += 0.1;
        }
      }
      score += Math.min(vibeBoost, 0.2);
    }

    return { book, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.book);
}
