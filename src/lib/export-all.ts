import { supabase } from "./supabase";
import { fetchAllRows } from "./fetch-all";
import { download, libraryCSV, today } from "./export";
import {
  exportFiles,
  type Conversation,
  type Excerpt,
  type ListRow,
  type MemoryNote,
  type Message,
  type Profile,
  type Shelf,
} from "./export-files";

// "Download everything" on the Settings page: what the reader has made here, as a .zip of
// files people can read (Markdown and the library CSV) plus one JSON file with all of it
// for other apps. Everything is read in the browser under Row Level Security, so it can
// only ever contain the reader's own data.

export interface ExportCounts {
  books: number;
  conversations: number;
  excerpts: number;
  memory: number;
  profiles: number;
  lists: number;
}

/** Gathers the reader's data and downloads it as one .zip. */
export async function exportEverything(): Promise<ExportCounts> {
  const [fflate, library, conversations, messages, excerpts, memory, profiles, lists, shelves] = await Promise.all([
    import("fflate"),
    libraryCSV(),
    fetchAllRows<Conversation>((from, to) =>
      supabase
        .from("conversations")
        .select("id, title, started_at, last_message_at, summary, is_onboarding, archived_at, book:books(title, author)")
        .order("started_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<Message>((from, to) =>
      supabase
        .from("messages")
        .select("conversation_id, role, content, actions, created_at")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<Excerpt>((from, to) =>
      supabase
        .from("book_excerpts")
        .select("content, created_at, conversation_id, book:books(title, author)")
        .is("deleted_at", null)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<MemoryNote>((from, to) =>
      supabase.from("memory_files").select("path, content, updated_at").order("path").range(from, to),
    ),
    fetchAllRows<Profile>((from, to) =>
      supabase
        .from("reader_profile")
        .select("generated_at, profile_data")
        .order("generated_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<ListRow>((from, to) =>
      supabase
        .from("lists")
        .select(
          "id, name, description, list_type, thesis, created_at, items:list_items(position, rationale, seminar_content, path_progress, external_title, external_author, book:books(title, author))",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<Shelf>((from, to) =>
      supabase
        .from("shelves")
        .select("name, description, shelf_type, filter, items:shelf_items(position, book:books(title, author))")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const { files, conversationCount } = exportFiles(
    { libraryCSV: library.csv, conversations, messages, excerpts, memory, profiles, lists, shelves },
    fflate.strToU8,
  );
  const zip = fflate.zipSync(files, { level: 6 });
  download(new Blob([zip], { type: "application/zip" }), `rekollekt-export-${today()}.zip`);

  return {
    books: library.count,
    conversations: conversationCount,
    excerpts: excerpts.length,
    memory: memory.length,
    profiles: profiles.length,
    lists: lists.length,
  };
}
