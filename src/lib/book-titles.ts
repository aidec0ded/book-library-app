import { useEffect, useState } from "react";
import { fetchLibraryTitles } from "@/lib/books";
import { normalizeFullTitle, normalizeWorkTitle } from "@/lib/editions";

/** The reader's titles by normalized title, and by title before any subtitle. */
export interface TitleIndex {
  full: Map<string, Set<string>>;
  work: Map<string, Set<string>>;
}

function add(map: Map<string, Set<string>>, key: string, id: string): void {
  if (!key) return;
  const ids = map.get(key) ?? new Set<string>();
  ids.add(id);
  map.set(key, ids);
}

let cached: Promise<TitleIndex> | null = null;
const listeners = new Set<() => void>();

async function loadIndex(): Promise<TitleIndex> {
  const index: TitleIndex = { full: new Map(), work: new Map() };
  for (const { id, title } of await fetchLibraryTitles()) {
    add(index.full, normalizeFullTitle(title), id);
    add(index.work, normalizeWorkTitle(title), id);
  }
  return index;
}

/** Load the titles again, after the companion has added or removed books. */
export function invalidateLibraryTitles(): void {
  cached = null;
  for (const listener of listeners) listener();
}

/** The reader's titles, loaded once and shared by every message. */
export function useLibraryTitles(): TitleIndex | null {
  const [index, setIndex] = useState<TitleIndex | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let current = true;
    cached ??= loadIndex();
    cached
      .then((loaded) => {
        if (current) setIndex(loaded);
      })
      .catch(() => {
        cached = null;
      });
    return () => {
      current = false;
    };
  }, [version]);

  return index;
}

const MIN_TITLE_CHARACTERS = 3;

/** The book an italicized title names, when exactly one book in the library matches. */
export function findBookId(index: TitleIndex | null, text: string): string | null {
  if (!index || text.trim().length < MIN_TITLE_CHARACTERS) return null;
  for (const [map, key] of [
    [index.full, normalizeFullTitle(text)],
    [index.work, normalizeWorkTitle(text)],
  ] as const) {
    const ids = key ? map.get(key) : undefined;
    if (ids?.size === 1) return [...ids][0] ?? null;
    // Two books with this title: don't guess which one is meant
    if (ids && ids.size > 1) return null;
  }
  return null;
}
