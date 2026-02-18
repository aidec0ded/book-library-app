import { supabase } from "@/lib/supabase";
import type { CanonicalTag, TagCategory } from "@/lib/types";

// Re-export pure data constants (defined separately so scripts can import
// without pulling in the browser Supabase client)
export {
  CANONICAL_VIBES,
  CANONICAL_VIBE_SET,
  formatCanonicalVibe,
} from "@/lib/canonical-vibes-data";
export type { CanonicalVibe } from "@/lib/canonical-vibes-data";

// --- DB-backed canonical tags (source of truth) ---

export async function fetchCanonicalTags(
  category?: TagCategory,
): Promise<CanonicalTag[]> {
  let query = supabase
    .from("canonical_tags")
    .select("*")
    .order("display_order")
    .order("tag");

  if (category) {
    query = query.eq("tag_category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchCanonicalTagSet(
  category: TagCategory,
): Promise<Set<string>> {
  const tags = await fetchCanonicalTags(category);
  return new Set(tags.map((t) => t.tag));
}
