import { supabase } from "@/lib/supabase";
import { MAX_MEMORY_CHARS } from "@/lib/memory-limit";

/** One of the notes files the companion keeps about the reader (`memory_files`). */
export interface MemoryFile {
  path: string;
  content: string;
  updated_at: string;
}

export async function fetchMemory(): Promise<MemoryFile[]> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("path, content, updated_at")
    .order("path");
  if (error) throw error;
  return (data ?? []) as MemoryFile[];
}

/** Thrown when the companion changed a file after the reader opened it for editing. */
export class MemoryChangedError extends Error {
  constructor() {
    super("Your companion changed this note while you were editing. Here's the latest; make your change again.");
  }
}

/**
 * Saves the reader's edit of a file. Only saves over the version they opened, so a change
 * the companion made meanwhile (in a chat in another tab) isn't lost. An empty file is
 * deleted.
 */
export async function saveMemoryFile(file: MemoryFile, content: string, all: MemoryFile[]): Promise<void> {
  if (!content.trim()) {
    await deleteMemoryFile(file.path);
    return;
  }

  const others = all.filter((f) => f.path !== file.path).reduce((n, f) => n + f.content.length, 0);
  if (others + content.length > MAX_MEMORY_CHARS) {
    throw new Error(
      `Memory holds at most ${MAX_MEMORY_CHARS.toLocaleString("en-US")} characters, and this would make it ` +
        `${(others + content.length).toLocaleString("en-US")}.`,
    );
  }

  const { data, error } = await supabase
    .from("memory_files")
    .update({ content })
    .eq("path", file.path)
    .eq("updated_at", file.updated_at)
    .select("path");
  if (error) throw error;
  if (!data || data.length === 0) throw new MemoryChangedError();
}

export async function deleteMemoryFile(path: string): Promise<void> {
  const { error } = await supabase.from("memory_files").delete().eq("path", path);
  if (error) throw error;
}

/** Deletes every memory file. Row Level Security limits it to the reader's own. */
export async function clearMemory(): Promise<void> {
  const { error } = await supabase.from("memory_files").delete().like("path", "/memories/%");
  if (error) throw error;
}
