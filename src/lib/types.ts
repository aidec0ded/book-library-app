export interface BookSummary {
  id: string;
  title: string;
  author: string;
  status: string | null;
  rating: number | null;
  timing_raw: string | null;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string | null;
  series: string | null;
  volume: string | null;
  author: string;
  isbn: string | null;
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
  transformative_potential: string | null;
  canon_potential: string | null;
  created_at: string;
}

export interface BookVibe {
  id: string;
  book_id: string;
  vibe: string;
  ai_assigned: boolean;
  user_confirmed: boolean;
  is_canonical: boolean;
  created_at: string;
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
