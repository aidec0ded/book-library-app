import type { SupabaseClient } from "@supabase/supabase-js";

export interface MemoryCommand {
  command: string;
  path?: string;
  content?: string;
  new_path?: string;
  old_str?: string;
  new_str?: string;
  insert_line?: number;
  view_range?: [number, number];
}

function validatePath(path: string): void {
  if (!path.startsWith("/memories/")) {
    throw new Error("Path must start with /memories/");
  }
  if (path.includes("..")) {
    throw new Error("Path traversal not allowed");
  }
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

export async function executeMemoryCommand(
  supabase: SupabaseClient,
  command: MemoryCommand,
): Promise<string> {
  switch (command.command) {
    case "view": {
      if (!command.path) {
        // List all files
        const { data, error } = await supabase
          .from("memory_files")
          .select("path, content")
          .order("path");

        if (error) throw error;

        if (!data || data.length === 0) {
          return "No memory files found. Use 'create' to create one.";
        }

        const lines = data.map((row) => {
          const size = new TextEncoder().encode(row.content).length;
          return `${row.path} (${size} bytes)`;
        });
        return lines.join("\n");
      }

      validatePath(command.path);

      const { data, error } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", command.path)
        .maybeSingle();

      if (error) throw error;
      if (!data) return `File not found: ${command.path}`;

      if (command.view_range) {
        const lines = data.content.split("\n");
        const [start, end] = command.view_range;
        const slice = lines.slice(start - 1, end);
        return formatLineNumbers(slice.join("\n"), start);
      }

      return formatLineNumbers(data.content);
    }

    case "create": {
      if (!command.path || command.content === undefined) {
        throw new Error("'create' requires path and content");
      }
      validatePath(command.path);

      // Check if file already exists
      const { data: existing } = await supabase
        .from("memory_files")
        .select("path")
        .eq("path", command.path)
        .maybeSingle();

      if (existing) {
        throw new Error(`File already exists: ${command.path}. Use str_replace to edit it.`);
      }

      const { error } = await supabase
        .from("memory_files")
        .insert({ path: command.path, content: command.content });

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

      const newContent = data.content.replace(command.old_str, command.new_str);
      const { error: updateError } = await supabase
        .from("memory_files")
        .update({ content: newContent })
        .eq("path", command.path);

      if (updateError) throw updateError;
      return `Updated ${command.path}`;
    }

    case "insert": {
      if (
        !command.path ||
        command.insert_line === undefined ||
        command.new_str === undefined
      ) {
        throw new Error("'insert' requires path, insert_line, and new_str");
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

      const newLines = command.new_str.split("\n");
      lines.splice(command.insert_line, 0, ...newLines);

      const { error: updateError } = await supabase
        .from("memory_files")
        .update({ content: lines.join("\n") })
        .eq("path", command.path);

      if (updateError) throw updateError;
      return `Inserted text at line ${command.insert_line} in ${command.path}`;
    }

    case "delete": {
      if (!command.path) {
        throw new Error("'delete' requires path");
      }
      validatePath(command.path);

      // Support prefix matching for directory-like deletes
      const { data: matches, error: matchError } = await supabase
        .from("memory_files")
        .select("path")
        .like("path", `${command.path}%`);

      if (matchError) throw matchError;
      if (!matches || matches.length === 0) {
        throw new Error(`No files found matching: ${command.path}`);
      }

      const paths = matches.map((m) => m.path);
      const { error } = await supabase
        .from("memory_files")
        .delete()
        .in("path", paths);

      if (error) throw error;
      return `Deleted ${paths.length} file(s)`;
    }

    case "rename": {
      if (!command.path || !command.new_path) {
        throw new Error("'rename' requires path and new_path");
      }
      validatePath(command.path);
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

      // Read source
      const { data: source, error: readError } = await supabase
        .from("memory_files")
        .select("content")
        .eq("path", command.path)
        .maybeSingle();

      if (readError) throw readError;
      if (!source) throw new Error(`File not found: ${command.path}`);

      // Insert at new path, delete old (path is PK so can't update it directly)
      const { error: insertError } = await supabase
        .from("memory_files")
        .insert({ path: command.new_path, content: source.content });

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from("memory_files")
        .delete()
        .eq("path", command.path);

      if (deleteError) throw deleteError;

      return `Renamed ${command.path} → ${command.new_path}`;
    }

    default:
      throw new Error(`Unknown memory command: ${command.command}`);
  }
}
