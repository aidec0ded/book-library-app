import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  clearMemory,
  deleteMemoryFile,
  fetchMemory,
  MemoryChangedError,
  saveMemoryFile,
  type MemoryFile,
} from "@/lib/memory";
import { MAX_MEMORY_CHARS, memoryFileTitle } from "@/lib/memory-limit";

const ChatMarkdown = lazy(() => import("@/components/ChatMarkdown"));

const primaryButton =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50";
const quietButton =
  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";
const dangerButton =
  "rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50";

const count = (n: number) => n.toLocaleString("en-US");

/** Settings section where readers see, edit, and delete what their companion remembers. */
export function MemorySettings() {
  const [files, setFiles] = useState<MemoryFile[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<{ path: string; draft: string } | null>(null);
  const [confirming, setConfirming] = useState<string | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles(await fetchMemory());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const used = (files ?? []).reduce((n, f) => n + f.content.length, 0);
  const editedTotal =
    editing && files
      ? used - (files.find((f) => f.path === editing.path)?.content.length ?? 0) + editing.draft.length
      : used;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
      setConfirming(null);
    } catch (err) {
      if (err instanceof MemoryChangedError) setEditing(null);
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      await load();
      setBusy(false);
    }
  };

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <h2 className="mb-2 text-lg font-semibold">Memory</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Your reading companion keeps short notes about you, what you've told it and what it has noticed
          about your reading, and reads them at the start of every conversation. Change or delete anything
          here, or tell your companion in a chat what to remember or forget.
        </p>

        {loadError ? (
          <p className="text-sm text-destructive">
            Your memory didn't load.{" "}
            <button onClick={() => void load()} className="underline underline-offset-2">
              Try again
            </button>
          </p>
        ) : files === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : files.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            Nothing yet. As you talk about your reading, what your companion learns about you will appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {files.map((file) => {
              const isEditing = editing?.path === file.path;
              return (
                <section key={file.path} aria-label={memoryFileTitle(file.path)}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium">{memoryFileTitle(file.path)}</h3>
                    <span className="text-xs text-muted-foreground">
                      Updated{" "}
                      {new Date(file.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editing.draft}
                        onChange={(e) => setEditing({ path: file.path, draft: e.target.value })}
                        rows={Math.min(16, Math.max(6, editing.draft.split("\n").length + 1))}
                        className="font-mono text-base sm:text-xs"
                        aria-label={`Edit ${memoryFileTitle(file.path)}`}
                        autoFocus
                        onFocus={(e) => {
                          // Start at the end, where a new line most often goes
                          const end = e.currentTarget.value.length;
                          e.currentTarget.setSelectionRange(end, end);
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => void run(() => saveMemoryFile(file, editing.draft, files))}
                          disabled={busy || editing.draft === file.content || editedTotal > MAX_MEMORY_CHARS}
                          className={primaryButton}
                        >
                          {busy ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => setEditing(null)} disabled={busy} className={quietButton}>
                          Cancel
                        </button>
                        <span
                          className={`ml-auto text-xs ${editedTotal > MAX_MEMORY_CHARS ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {count(editedTotal)} of {count(MAX_MEMORY_CHARS)} characters
                        </span>
                      </div>
                      {!editing.draft.trim() && (
                        <p className="text-xs text-muted-foreground">Saving it empty deletes this note.</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="max-h-80 overflow-y-auto break-words rounded-md bg-muted/50 px-3 py-2.5 text-sm leading-relaxed">
                        <Suspense fallback={<p className="whitespace-pre-line">{file.content.trim()}</p>}>
                          <ChatMarkdown content={file.content.trim()} />
                        </Suspense>
                      </div>
                      {confirming === file.path ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm">Delete this note for good?</span>
                          <button
                            onClick={() => void run(() => deleteMemoryFile(file.path))}
                            disabled={busy}
                            className={dangerButton}
                          >
                            {busy ? "Deleting..." : "Delete"}
                          </button>
                          <button onClick={() => setConfirming(null)} disabled={busy} className={quietButton}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-1 flex gap-1">
                          <button
                            onClick={() => {
                              setError(null);
                              setConfirming(null);
                              setEditing({ path: file.path, draft: file.content.trim() });
                            }}
                            disabled={busy || editing !== null}
                            className={quietButton}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setError(null);
                              setConfirming(file.path);
                            }}
                            disabled={busy || editing !== null}
                            className={quietButton}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-xs text-muted-foreground">
                {count(used)} of {count(MAX_MEMORY_CHARS)} characters used
              </span>
              {confirming === "all" ? (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="text-sm">Delete everything it remembers?</span>
                  <button onClick={() => void run(clearMemory)} disabled={busy} className={dangerButton}>
                    {busy ? "Deleting..." : "Delete all"}
                  </button>
                  <button onClick={() => setConfirming(null)} disabled={busy} className={quietButton}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setError(null);
                    setConfirming("all");
                  }}
                  disabled={busy || editing !== null}
                  className={`ml-auto ${quietButton} hover:text-destructive`}
                >
                  Forget everything
                </button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Your reader profile was written partly from these notes. It reflects your changes the next time
              it's generated.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
