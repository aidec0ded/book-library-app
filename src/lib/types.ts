export type BookType = "fiction" | "nonfiction" | "poetry";

export type TagCategory =
  | "vibe"
  | "topic"
  | "form"
  | "depth"
  | "movement"
  | "formal_feel"
  | "accessibility";

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  book_type: BookType;
  status: string | null;
  rating: number | null;
  timing_raw: string | null;
  cover_image_url: string | null;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string | null;
  series: string | null;
  volume: string | null;
  author: string;
  isbn: string | null;
  book_type: BookType;
  genre: string | null;
  summary: string | null;
  category: string | null;
  status: string | null;
  date_started: string | null;
  date_finished: string | null;
  rating: number | null;
  is_favorite: boolean;
  is_up_next: boolean;
  notes: string | null;
  cover_image_url: string | null;
  page_count: number | null;
  publisher: string | null;
  publication_year: number | null;
  format: string | null;
  isbndb_enriched_at: string | null;
  timing_month: number | null;
  timing_position: string | null;
  timing_raw: string | null;
  predicted_rating: number | null;
  predicted_rationale: string | null;
  predicted_at: string | null;
  created_at: string;
}

export interface BookVibe {
  id: string;
  book_id: string;
  vibe: string;
  tag_category: TagCategory;
  ai_assigned: boolean;
  user_confirmed: boolean;
  is_canonical: boolean;
  created_at: string;
}

export interface CanonicalTag {
  id: string;
  tag: string;
  tag_category: TagCategory;
  description: string;
  display_order: number;
}

export interface Conversation {
  id: string;
  started_at: string;
  title: string | null;
  archived_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface BookExcerpt {
  id: string;
  book_id: string;
  conversation_id: string | null;
  content: string;
  created_at: string;
}

export interface ThematicPillar {
  name: string;
  description: string;
  example_books: string[];
}

export interface TasteShift {
  noted_at: string;
  description: string;
}

export interface TasteEvolution {
  current_gravitational_pulls: string;
  shift_log: TasteShift[];
  consistent_throughlines: string;
}

export interface ReadingLifeSnapshot {
  currently_reading: string[];
  recently_finished: string[];
  reading_pace_description: string;
  status_breakdown: Record<string, number>;
}

export interface ReaderProfileData {
  reader_identity: string;
  thematic_pillars: ThematicPillar[];
  taste_evolution: TasteEvolution;
  emotional_patterns: string;
  reading_life_snapshot: ReadingLifeSnapshot;
  personal_canon: string[];
}

export interface ReaderProfile {
  id: string;
  generated_at: string;
  profile_data: ReaderProfileData;
  generation_context: Record<string, unknown> | null;
  created_at: string;
}

export interface List {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  book_id: string;
  position: number;
  added_at: string;
}

export interface ListWithCount extends List {
  book_count: number;
  cover_book: { title: string; author: string; cover_image_url: string | null } | null;
}

export interface ShelfFilter {
  status?: string;
  genre?: string;
  rating_min?: number;
  timing_month?: number;
  vibes?: string[];
  is_favorite?: boolean;
}

export type ShelfType = "manual" | "auto";

export interface Shelf {
  id: string;
  name: string;
  description: string | null;
  shelf_type: ShelfType;
  filter: ShelfFilter | null;
  created_at: string;
  updated_at: string;
}

export interface ShelfItem {
  id: string;
  shelf_id: string;
  book_id: string;
  position: number;
  added_at: string;
}

export interface ShelfWithCover extends Shelf {
  book_count: number;
  cover_book: Pick<Book, "id" | "title" | "author" | "cover_image_url"> | null;
}

export interface NewRelease {
  id: string;
  isbn13: string;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  date_published: string | null;
  pub_year: number | null;
  pub_month: number | null;
  cover_image_url: string | null;
  synopsis: string | null;
  subjects: string[];
  binding: string | null;
  page_count: number | null;
  language: string | null;
  edition: string | null;
  source: string;
  ingested_at: string;
  updated_at: string;
  general_signal_score: number | null;
  personal_score: number | null;
  ai_score: number | null;
  ai_rationale: string | null;
  scored_at: string | null;
  dismissed: boolean;
  is_fiction: boolean | null;
}
