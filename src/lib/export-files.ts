import { memoryFileTitle } from "./memory-limit";
import type { MessageAction, ReaderProfileData, SeminarContent } from "./types";

// The files in "Download everything", built from the reader's data. Kept apart from the
// fetching (export-all.ts) so it can be run and checked outside the browser.

export interface Conversation {
  id: string;
  title: string | null;
  started_at: string;
  last_message_at: string | null;
  summary: string | null;
  is_onboarding: boolean;
  archived_at: string | null;
  book: { title: string; author: string } | null;
}

export interface Message {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  actions: MessageAction[] | null;
  created_at: string;
}

export interface Excerpt {
  content: string;
  created_at: string;
  conversation_id: string | null;
  book: { title: string; author: string } | null;
}

export interface MemoryNote {
  path: string;
  content: string;
  updated_at: string;
}

export interface Profile {
  generated_at: string;
  profile_data: ReaderProfileData;
}

export interface ListRow {
  id: string;
  name: string;
  description: string | null;
  list_type: "syllabus" | "reading_path";
  thesis: string | null;
  created_at: string;
  items: {
    position: number;
    rationale: string | null;
    seminar_content: SeminarContent | null;
    path_progress: string | null;
    external_title: string | null;
    external_author: string | null;
    book: { title: string; author: string } | null;
  }[];
}

export interface Shelf {
  name: string;
  description: string | null;
  shelf_type: "manual" | "auto";
  filter: unknown;
  items: { position: number; book: { title: string; author: string } | null }[];
}


const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
const shortDate = (iso: string) => iso.slice(0, 10);
const byTitle = (b: { title: string; author: string } | null) => (b ? `*${b.title}* by ${b.author}` : null);

/** A file name from a title: no characters any system refuses, short, and unique. */
function fileNamer() {
  const used = new Set<string>();
  return (base: string, ext: string) => {
    const clean = base
      .replace(/\s*:\s*/g, " - ")
      .replace(/[\\/*?"<>|#%{}^~[\]`]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
    let name = `${clean}.${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${clean} (${n}).${ext}`;
    used.add(name.toLowerCase());
    return name;
  };
}

function conversationMarkdown(c: Conversation, messages: Message[]): string {
  const lines = [`# ${c.title || "Untitled conversation"}`, ""];
  lines.push(`Started ${longDate(c.started_at)}${c.is_onboarding ? " (getting started)" : ""}`);
  if (c.book) lines.push(`About ${byTitle(c.book)}`);
  if (c.summary) lines.push("", `> ${c.summary}`);
  for (const m of messages) {
    // A reply that failed before writing anything leaves an empty message
    if (!m.content.trim() && !m.actions?.some((a) => a.label)) continue;
    lines.push("", "---", "", `**${m.role === "user" ? "You" : "Companion"}** · ${longDate(m.created_at)}`, "", m.content.trim());
    const changes = (m.actions ?? []).filter((a) => a.label);
    if (changes.length > 0) {
      lines.push("", ...changes.map((a) => `- ${a.failed ? "Didn't go through: " : ""}${a.label}`));
    }
  }
  return lines.join("\n") + "\n";
}

function excerptsMarkdown(excerpts: Excerpt[]): string {
  const lines = ["# Excerpts", "", "What you kept from your conversations, by book."];
  const groups = new Map<string, Excerpt[]>();
  for (const e of excerpts) {
    const key = byTitle(e.book) ?? "A deleted book";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [book, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push("", `## ${book}`);
    for (const e of items) lines.push("", `> ${e.content.trim().replace(/\n/g, "\n> ")}`, "", `Saved ${longDate(e.created_at)}`);
  }
  return lines.join("\n") + "\n";
}

function memoryMarkdown(notes: MemoryNote[]): string {
  const lines = ["# What your companion remembers", "", "The notes your reading companion keeps about you, as of this export."];
  for (const n of notes) {
    // The note's own headings go under its name
    const body = n.content.trim().replace(/^(#{1,4}) /gm, "##$1 ");
    lines.push("", `## ${memoryFileTitle(n.path)}`, "", `Updated ${longDate(n.updated_at)}`, "", body);
  }
  return lines.join("\n") + "\n";
}

function profileMarkdown(p: Profile): string {
  const d = p.profile_data;
  const lines = [`# Your reader profile`, "", `Generated ${longDate(p.generated_at)}`];
  const section = (title: string, body: string | undefined | null) => {
    if (body && body.trim()) lines.push("", `## ${title}`, "", body.trim());
  };
  const list = (title: string, items: string[] | undefined | null) => {
    if (items && items.length > 0) lines.push("", `## ${title}`, "", ...items.map((i) => `- ${i}`));
  };

  section("Who you are as a reader", d.reader_identity);
  if (d.thematic_pillars?.length) {
    lines.push("", "## Thematic pillars");
    for (const pillar of d.thematic_pillars) {
      lines.push("", `### ${pillar.name}`, "", pillar.description);
      if (pillar.example_books?.length) lines.push("", `Books: ${pillar.example_books.join("; ")}`);
    }
  }
  if (d.taste_evolution) {
    section("What draws you now", d.taste_evolution.current_gravitational_pulls);
    section("What stays constant", d.taste_evolution.consistent_throughlines);
    if (d.taste_evolution.shift_log?.length) {
      lines.push("", "## Shift log", "", ...d.taste_evolution.shift_log.map((s) => `- ${s.noted_at}: ${s.description}`));
    }
  }
  section("Emotional patterns", d.emotional_patterns);
  if (d.reading_life_snapshot) {
    list("Reading at the time", d.reading_life_snapshot.currently_reading);
    list("Recently finished", d.reading_life_snapshot.recently_finished);
    section("Your pace", d.reading_life_snapshot.reading_pace_description);
  }
  section("Nonfiction", d.nonfiction_identity);
  list("Nonfiction interests", d.nonfiction_interests);
  section("Poetry", d.poetry_identity);
  list("Poets", d.poet_affinities);
  list("Personal canon", d.personal_canon);
  return lines.join("\n") + "\n";
}

function listMarkdown(l: ListRow): string {
  const lines = [`# ${l.name}`, "", `${l.list_type === "reading_path" ? "Reading path" : "Syllabus"}, made ${longDate(l.created_at)}`];
  if (l.description) lines.push("", l.description.trim());
  if (l.thesis) lines.push("", `> ${l.thesis.trim()}`);
  for (const item of [...l.items].sort((a, b) => a.position - b.position)) {
    const book = item.book ?? (item.external_title ? { title: item.external_title, author: item.external_author ?? "Unknown" } : null);
    const progress = item.path_progress && item.path_progress !== "not_started" ? ` (${item.path_progress.replace("_", " ")})` : "";
    lines.push("", `## ${item.position}. ${byTitle(book) ?? "Untitled"}${progress}`);
    if (item.rationale) lines.push("", item.rationale.trim());
    const s = item.seminar_content;
    if (s?.pre_reading_context) lines.push("", "**Before reading**", "", s.pre_reading_context.trim());
    if (s?.focus_questions?.length) lines.push("", "**Focus questions**", "", ...s.focus_questions.map((q) => `- ${q}`));
    if (s?.post_reading_prompts?.length) lines.push("", "**After reading**", "", ...s.post_reading_prompts.map((q) => `- ${q}`));
  }
  return lines.join("\n") + "\n";
}

const README = `# Your Rekollekt export

Everything you've made in Rekollekt, as of ${longDate(new Date().toISOString())}.

- library.csv: your books, with status, rating, dates, and notes
- conversations/: each conversation with your reading companion
- excerpts.md: what you kept from conversations, by book
- memory.md: the notes your companion keeps about you
- profiles/: each reader profile, by the date it was generated
- lists/: your syllabi and reading paths
- rekollekt.json: all of the above, plus your shelves, in one file for other apps
`;

export interface ExportData {
  libraryCSV: string;
  conversations: Conversation[];
  messages: Message[];
  excerpts: Excerpt[];
  memory: MemoryNote[];
  profiles: Profile[];
  lists: ListRow[];
  shelves: Shelf[];
}

/** The export's files by path, and how many conversations had messages. */
export function exportFiles(
  data: ExportData,
  strToU8: (text: string) => Uint8Array,
): { files: Record<string, Uint8Array>; conversationCount: number } {
  const { conversations, messages, excerpts, memory, profiles, lists, shelves } = data;
  const files: Record<string, Uint8Array> = {
    "README.md": strToU8(README),
    "library.csv": strToU8(data.libraryCSV),
  };

  const messagesByConversation = new Map<string, Message[]>();
  for (const m of messages) {
    messagesByConversation.set(m.conversation_id, [...(messagesByConversation.get(m.conversation_id) ?? []), m]);
  }
  const conversationName = fileNamer();
  for (const c of conversations) {
    const thread = messagesByConversation.get(c.id) ?? [];
    if (thread.length === 0) continue;
    const name = conversationName(`${shortDate(c.started_at)} ${c.title || "Untitled conversation"}`, "md");
    files[`conversations/${name}`] = strToU8(conversationMarkdown(c, thread));
  }

  if (excerpts.length > 0) files["excerpts.md"] = strToU8(excerptsMarkdown(excerpts));
  if (memory.length > 0) files["memory.md"] = strToU8(memoryMarkdown(memory));

  const profileName = fileNamer();
  for (const p of profiles) {
    files[`profiles/${profileName(`Reader profile ${shortDate(p.generated_at)}`, "md")}`] = strToU8(profileMarkdown(p));
  }

  const listName = fileNamer();
  for (const l of lists) files[`lists/${listName(l.name, "md")}`] = strToU8(listMarkdown(l));

  const json = {
    exported_at: new Date().toISOString(),
    conversations: conversations.map((c) => ({
      ...c,
      messages: (messagesByConversation.get(c.id) ?? []).map(({ conversation_id: _, ...m }) => m),
    })),
    excerpts,
    memory,
    profiles,
    lists,
    shelves,
  };
  files["rekollekt.json"] = strToU8(JSON.stringify(json, null, 2));

  return { files, conversationCount: conversations.filter((c) => messagesByConversation.has(c.id)).length };
}
