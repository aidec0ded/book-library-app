/**
 * All of a reader's memory goes into every chat prompt, so it has a size limit: about
 * 3,000 tokens across their files. Shared by the server (the companion's update_memory
 * tool and the prompt) and the Settings page, where readers edit it.
 */
export const MAX_MEMORY_CHARS = 12_000;

/** A memory file's name as a reader sees it: "/memories/reading_log.md" is "Reading log". */
export function memoryFileTitle(path: string): string {
  const name = (path.split("/").pop() ?? "").replace(/\.md$/i, "");
  if (name === "reader") return "About you";
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Notes";
}
