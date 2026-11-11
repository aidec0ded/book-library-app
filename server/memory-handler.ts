import type { SupabaseClient } from "@supabase/supabase-js";

// The chat's update_memory tool. Its commands follow the shapes of Anthropic's
// memory tool (create sends file_text, insert sends insert_text, rename sends
// old_path/new_path), plus append. The legacy names (content, new_str for insert,
// path for rename) are still accepted as fallbacks.
export interface MemoryCommand {
  command: string;
  path?: string;
  file_text?: string;
  content?: string;
  old_path?: string;
  new_path?: string;
  old_str?: string;
  new_str?: string;
  insert_line?: number;
  insert_text?: string;
  view_range?: [number, number];
}

const ROOT = "/memories";

/**
 * All of a reader's memory goes into every chat prompt (see loadCoreMemory), so it
 * has a size limit: about 3,000 tokens. Writes that would pass it are refused, and
 * the companion condenses instead.
 */
export const MAX_MEMORY_CHARS = 12_000;

interface MemoryFile {
  path: string;
  content: string;
}

async function fetchAllFiles(supabase: SupabaseClient): Promise<MemoryFile[]> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("path, content")
    .order("path");
  if (error) throw error;
  return (data ?? []) as MemoryFile[];
}

/** Refuses a write that would take the reader's memory past MAX_MEMORY_CHARS. */
async function assertFits(supabase: SupabaseClient, path: string, newContent: string): Promise<void> {
  const files = await fetchAllFiles(supabase);
  const others = files.filter((f) => f.path !== path).reduce((n, f) => n + f.content.length, 0);
  const total = others + newContent.length;
  if (total > MAX_MEMORY_CHARS) {
    throw new Error(
      `Memory is limited to ${MAX_MEMORY_CHARS.toLocaleString("en-US")} characters, and this would make it ` +
        `${total.toLocaleString("en-US")}. Condense or remove what matters less, then try again.`,
    );
  }
}

/**
 * The reader's memory as it goes into the chat prompt, so the companion has it from
 * the first word of every conversation without a tool call.
 */
export async function loadCoreMemory(supabase: SupabaseClient): Promise<string> {
  const files = await fetchAllFiles(supabase);
  const heading = "## What you remember about this reader";
  if (files.length === 0) {
    return `${heading}
Nothing yet. This is where update_memory saves what you learn about them.`;
  }
  const used = files.reduce((n, f) => n + f.content.length, 0);
  return [
    `${heading}
Your memory files, as they stand (${used.toLocaleString("en-US")} of ${MAX_MEMORY_CHARS.toLocaleString("en-US")} characters used).`,
    ...files.map((f) => `### ${f.path}\n${f.content.trim()}`),
  ].join("\n\n");
}

function validatePath(path: string): void {
  if (path !== ROOT && !path.startsWith(`${ROOT}/`)) {
    throw new Error(`Path must be ${ROOT} or start with ${ROOT}/`);
  }
  if (path.includes("..")) {
    throw new Error("Path traversal not allowed");
  }
}

// Directory paths ("/memories", "/memories/books/") normalize to a trailing slash
function asDirectory(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function formatLineNumbers(content: string, startLine = 1): string {
  const lines = content.split("\n");
  return lines
    .map((line, i) => {
      const num = String(startLine + i).padStart(6, " ");
      return `${num}\t${line}`;
    })
    .join("\n");
}

// A user has only a handful of memory files (RLS scopes the query to them), so
// prefix matching happens here rather than with LIKE, where "_" in names like
// "reader_profile.md" would act as a wildcard.
async function listDirectory(supabase: SupabaseClient, dir: string): Promise<string> {
  const { data: rows, error } = await supabase
    .from("memory_files")
    .select("path, content")
    .order("path");

  if (error) throw error;

  const data = (rows ?? []).filter((row) => row.path.startsWith(dir));
  if (data.length === 0) {
    return dir === `${ROOT}/`
      ? `No memory files found in ${ROOT}. Use 'create' to create one.`
      : `No files found in ${dir}`;
  }

  const lines = data.map((row) => {
    const size = new TextEncoder().encode(row.content).length;
    return `${row.path} (${size} bytes)`;
  });
  return lines.join("\n");
}

export async function executeMemoryCommand(
  supabase: SupabaseClient,
  command: MemoryCommand,
): Promise<string> {
  switch (command.command) {
    case "view": {
      const path = command.path ?? ROOT;
      validatePath(path);

      if (path === ROOT || path.endsWith("/")) {
        return listDirectory(supabase, asDirectory(path));
      }

      const { data, error } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", path)
        .maybeSingle();

      if (error) throw error;
      // Not a file — it may be a directory given without a trailing slash
      if (!data) {
        const listing = await listDirectory(supabase, asDirectory(path));
        return listing.startsWith("No files found") ? `File not found: ${path}` : listing;
      }

      if (command.view_range) {
        const lines = data.content.split("\n");
        const [start, end] = command.view_range;
        const slice = lines.slice(start - 1, end === -1 ? undefined : end);
        return formatLineNumbers(slice.join("\n"), start);
      }

      return formatLineNumbers(data.content);
    }

    case "create": {
      const fileText = command.file_text ?? command.content;
      if (!command.path || fileText === undefined) {
        throw new Error("'create' requires path and file_text");
      }
      validatePath(command.path);
      if (command.path === ROOT || command.path.endsWith("/")) {
        throw new Error("'create' requires a file path, not a directory");
      }

      await assertFits(supabase, command.path, fileText);

      // create overwrites an existing file, per the memory tool spec
      const { data: existing, error: lookupError } = await supabase
        .from("memory_files")
        .select("path")
        .eq("path", command.path)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        const { error } = await supabase
          .from("memory_files")
          .update({ content: fileText })
          .eq("path", command.path);
        if (error) throw error;
        return `Overwrote ${command.path}`;
      }

      const { error } = await supabase
        .from("memory_files")
        .insert({ path: command.path, content: fileText });

      if (error) throw error;
      return `Created ${command.path}`;
    }

    case "str_replace": {
      if (!command.path || !command.old_str || command.new_str === undefined) {
        throw new Error("'str_replace' requires path, old_str, and new_str");
      }
      validatePath(command.path);

      const { data, error } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", command.path)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(`File not found: ${command.path}`);

      const occurrences = data.content.split(command.old_str).length - 1;
      if (occurrences === 0) {
        throw new Error(
          `String not found in ${command.path}. Make sure the old_str matches exactly.`,
        );
      }
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} occurrences of old_str in ${command.path}. It must match exactly once.`,
        );
      }

      // Function replacer so "$&" etc. in new_str are inserted literally
      const newContent = data.content.replace(command.old_str, () => command.new_str!);
      await assertFits(supabase, command.path, newContent);
      const { error: updateError } = await supabase
        .from("memory_files")
        .update({ content: newContent })
        .eq("path", command.path);

      if (updateError) throw updateError;
      return `Updated ${command.path}`;
    }

    case "insert": {
      const insertText = command.insert_text ?? command.new_str;
      if (
        !command.path ||
        command.insert_line === undefined ||
        insertText === undefined
      ) {
        throw new Error("'insert' requires path, insert_line, and insert_text");
      }
      validatePath(command.path);

      const { data, error } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", command.path)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(`File not found: ${command.path}`);

      const lines = data.content.split("\n");
      if (command.insert_line < 0 || command.insert_line > lines.length) {
        throw new Error(
          `insert_line ${command.insert_line} out of range (0-${lines.length})`,
        );
      }

      const newLines = insertText.split("\n");
      lines.splice(command.insert_line, 0, ...newLines);
      const newContent = lines.join("\n");
      await assertFits(supabase, command.path, newContent);

      const { error: updateError } = await supabase
        .from("memory_files")
        .update({ content: newContent })
        .eq("path", command.path);

      if (updateError) throw updateError;
      return `Inserted text at line ${command.insert_line} in ${command.path}`;
    }

    case "append": {
      const text = command.file_text ?? command.content ?? command.new_str;
      if (!command.path || text === undefined) {
        throw new Error("'append' requires path and file_text");
      }
      validatePath(command.path);
      if (command.path === ROOT || command.path.endsWith("/")) {
        throw new Error("'append' requires a file path, not a directory");
      }

      const { data, error } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", command.path)
        .maybeSingle();
      if (error) throw error;

      // Appending to a file that doesn't exist yet creates it
      const newContent = data ? `${data.content.replace(/\s+$/, "")}\n${text}` : text;
      await assertFits(supabase, command.path, newContent);
      const { error: writeError } = data
        ? await supabase.from("memory_files").update({ content: newContent }).eq("path", command.path)
        : await supabase.from("memory_files").insert({ path: command.path, content: newContent });
      if (writeError) throw writeError;
      return data ? `Added to ${command.path}` : `Created ${command.path}`;
    }

    case "delete": {
      if (!command.path) {
        throw new Error("'delete' requires path");
      }
      validatePath(command.path);

      // Exact file match, or everything under it when it names a directory.
      // (A bare prefix match would let "/memories/book" delete "/memories/books.md".)
      const dir = asDirectory(command.path);
      const { data: rows, error: matchError } = await supabase
        .from("memory_files")
        .select("path");

      if (matchError) throw matchError;
      const paths = (rows ?? [])
        .map((r) => r.path as string)
        .filter((p) => p === command.path || p.startsWith(dir));
      if (paths.length === 0) {
        throw new Error(`No files found matching: ${command.path}`);
      }

      const { error } = await supabase
        .from("memory_files")
        .delete()
        .in("path", paths);

      if (error) throw error;
      return `Deleted ${paths.length} file(s)`;
    }

    case "rename": {
      const oldPath = command.old_path ?? command.path;
      if (!oldPath || !command.new_path) {
        throw new Error("'rename' requires old_path and new_path");
      }
      validatePath(oldPath);
      validatePath(command.new_path);

      // Check destination doesn't exist
      const { data: destExists } = await supabase
        .from("memory_files")
        .select("path")
        .eq("path", command.new_path)
        .maybeSingle();

      if (destExists) {
        throw new Error(`Destination already exists: ${command.new_path}`);
      }

      const { data: source, error: readError } = await supabase
        .from("memory_files")
        .select("path")
        .eq("path", oldPath)
        .maybeSingle();

      if (readError) throw readError;
      if (!source) throw new Error(`File not found: ${oldPath}`);

      const { error: updateError } = await supabase
        .from("memory_files")
        .update({ path: command.new_path })
        .eq("path", oldPath);

      if (updateError) throw updateError;

      return `Renamed ${oldPath} → ${command.new_path}`;
    }

    default:
      throw new Error(`Unknown memory command: ${command.command}`);
  }
}
