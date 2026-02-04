import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReaderProfileData,
  ThematicPillar,
  TasteShift,
} from "../src/lib/types.js";

let cachedProfile: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function loadReaderProfile(
  supabase: SupabaseClient,
): Promise<string | null> {
  if (cachedProfile !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedProfile;
  }

  const { data, error } = await supabase
    .from("reader_profile")
    .select("profile_data")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    cachedProfile = null;
    cachedAt = Date.now();
    return null;
  }

  const profile = data.profile_data as ReaderProfileData;
  cachedProfile = formatProfileForPrompt(profile);
  cachedAt = Date.now();
  return cachedProfile;
}

function formatProfileForPrompt(profile: ReaderProfileData): string {
  const sections: string[] = [];

  sections.push("### Reader Identity\n");
  sections.push(profile.reader_identity);

  sections.push("\n### Thematic Pillars\n");
  for (const pillar of profile.thematic_pillars) {
    sections.push(formatPillar(pillar));
  }

  sections.push("\n### Taste Evolution\n");
  sections.push("**Current Gravitational Pulls**\n");
  sections.push(profile.taste_evolution.current_gravitational_pulls);

  if (profile.taste_evolution.shift_log.length > 0) {
    sections.push("\n**Shift Log**\n");
    for (const shift of profile.taste_evolution.shift_log) {
      sections.push(formatShift(shift));
    }
  }

  sections.push("\n**Consistent Throughlines**\n");
  sections.push(profile.taste_evolution.consistent_throughlines);

  sections.push("\n### Emotional Patterns\n");
  sections.push(profile.emotional_patterns);

  const snapshot = profile.reading_life_snapshot;
  sections.push("\n### Reading Life Snapshot\n");
  if (snapshot.currently_reading.length > 0) {
    sections.push(
      `Currently reading: ${snapshot.currently_reading.join(", ")}`,
    );
  }
  sections.push(snapshot.reading_pace_description);

  return sections.join("\n");
}

function formatPillar(pillar: ThematicPillar): string {
  const books = pillar.example_books.join("; ");
  return `- **${pillar.name}**: ${pillar.description} (e.g. ${books})`;
}

function formatShift(shift: TasteShift): string {
  const date = new Date(shift.noted_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
  return `- ${date}: ${shift.description}`;
}
