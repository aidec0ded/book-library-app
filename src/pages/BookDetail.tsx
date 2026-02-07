import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ExternalLink, Pencil, X, Check, Star, MessageSquareQuote, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { VibeEditor } from "@/components/VibeEditor";
import { updateBook, deleteBook, formatRating } from "@/lib/books";
import { fetchExcerptsForBook, deleteExcerpt } from "@/lib/excerpts";
import { fetchAwardsForBook, type BookAward } from "@/lib/awards";
import { BookCover } from "@/components/BookCover";
import { useChatContext } from "@/contexts/ChatContext";
import type { Book, BookExcerpt } from "@/lib/types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const STATUS_OPTIONS = ["unread", "reading", "read", "unfinished", "wishlist"] as const;

const RATING_OPTIONS: { label: string; value: string }[] = [
  { label: "Unrated", value: "unrated" },
  ...Array.from({ length: 20 }, (_, i) => {
    const v = (20 - i) * 0.25;
    return { label: `★ ${formatRating(v)}`, value: v.toString() };
  }),
];

export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openPanel } = useChatContext();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [coverBroken, setCoverBroken] = useState(false);

  // Editable fields state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingCover, setEditingCover] = useState(false);
  const [coverDraft, setCoverDraft] = useState("");
  const [editingIsbn, setEditingIsbn] = useState(false);
  const [isbnDraft, setIsbnDraft] = useState("");
  const [excerpts, setExcerpts] = useState<BookExcerpt[]>([]);
  const [excerptsLoading, setExcerptsLoading] = useState(true);
  const [awards, setAwards] = useState<BookAward[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("books")
        .select("*")
        .eq("id", id!)
        .single();

      if (err) {
        setError(err.message);
      } else {
        setBook(data);
      }
      setLoading(false);
    }
    void fetch();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setExcerptsLoading(true);
    fetchExcerptsForBook(id)
      .then(setExcerpts)
      .catch(() => setExcerpts([]))
      .finally(() => setExcerptsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchAwardsForBook(id)
      .then(setAwards)
      .catch(() => setAwards([]));
  }, [id]);

  // Auto-clear save errors after 4 seconds
  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 4000);
    return () => clearTimeout(timer);
  }, [saveError]);

  const handleFieldUpdate = useCallback(
    async (field: keyof Book, value: unknown) => {
      if (!book) return;
      const prev = book[field];
      setBook({ ...book, [field]: value });
      setSaving(field);
      try {
        await updateBook(book.id, { [field]: value } as Parameters<typeof updateBook>[1]);
      } catch {
        setBook({ ...book, [field]: prev });
        setSaveError(`Failed to save ${field.replace(/_/g, " ")}`);
      } finally {
        setSaving(null);
      }
    },
    [book],
  );

  const handleDeleteExcerpt = useCallback(
    async (excerptId: string) => {
      const prev = excerpts;
      setExcerpts(excerpts.filter((e) => e.id !== excerptId));
      try {
        await deleteExcerpt(excerptId);
      } catch {
        setExcerpts(prev);
        setSaveError("Failed to delete excerpt");
      }
    },
    [excerpts],
  );

  const handleDeleteBook = useCallback(async () => {
    if (!book) return;
    try {
      await deleteBook(book.id);
      navigate("/library");
    } catch {
      setSaveError("Failed to delete book");
      setConfirmingDelete(false);
    }
  }, [book, navigate]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !book) {
    return (
      <div className="space-y-2">
        <div className="text-destructive">{error ?? "Book not found."}</div>
        <Link to="/library" className="text-sm underline">
          Back to list
        </Link>
      </div>
    );
  }

  const ratingDisplayValue =
    book.rating === null || book.rating === 0 ? "unrated" : book.rating.toString();

  const showPredictedRating =
    book.status === "unread" || book.status === "wishlist" || book.status === null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={-1 as unknown as string}
        onClick={(e) => {
          e.preventDefault();
          window.history.back();
        }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>

      {/* Save error banner */}
      {saveError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Title & Author */}
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">{book.title}</h1>
        {book.subtitle && (
          <p className="text-lg text-muted-foreground">{book.subtitle}</p>
        )}
        <p className="mt-1 text-muted-foreground">{book.author}</p>
        {book.series && (
          <p className="text-sm text-muted-foreground">
            {book.series}
            {book.volume ? `, Vol. ${book.volume}` : ""}
          </p>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Left column: Cover + Controls */}
        <div className="space-y-4">
          {/* Cover with edit */}
          <div className="space-y-2">
            {book.cover_image_url && !coverBroken ? (
              <img
                src={book.cover_image_url}
                alt={`Cover of ${book.title}`}
                className="h-auto w-full max-w-[240px] rounded-lg shadow-md mx-auto lg:mx-0"
                loading="lazy"
                onError={() => setCoverBroken(true)}
                onLoad={(e) => {
                  if (e.currentTarget.naturalWidth === 0) setCoverBroken(true);
                }}
              />
            ) : (
              <div className="mx-auto lg:mx-0">
                <BookCover book={book} size="lg" />
              </div>
            )}

            {editingCover ? (
              <div className="space-y-2">
                <Input
                  placeholder="Cover image URL..."
                  value={coverDraft}
                  onChange={(e) => setCoverDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingCover(false);
                    } else if (e.key === "Enter") {
                      const trimmed = coverDraft.trim();
                      handleFieldUpdate("cover_image_url", trimmed || null);
                      setEditingCover(false);
                      setCoverBroken(false);
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      const trimmed = coverDraft.trim();
                      handleFieldUpdate("cover_image_url", trimmed || null);
                      setEditingCover(false);
                      setCoverBroken(false);
                    }}
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                  <button
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => setEditingCover(false)}
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setCoverDraft(book.cover_image_url ?? "");
                  setEditingCover(true);
                }}
              >
                Edit cover
              </button>
            )}
          </div>

          <Separator />

          {/* Status dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={book.status ?? "unread"}
              onValueChange={(val) => handleFieldUpdate("status", val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rating dropdown (hidden for wishlist) */}
          {book.status !== "wishlist" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Rating</label>
              <Select
                value={ratingDisplayValue}
                onValueChange={(val) =>
                  handleFieldUpdate("rating", val === "unrated" ? null : parseFloat(val))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATING_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saving === "rating" && (
                <span className="text-xs text-muted-foreground">Saving...</span>
              )}
            </div>
          )}

          {/* Favorite badge (hidden for wishlist) */}
          {book.status !== "wishlist" && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={book.is_favorite ? "default" : "outline"}
                className={`cursor-pointer select-none ${!book.is_favorite ? "opacity-50 hover:opacity-80" : ""}`}
                onClick={() => handleFieldUpdate("is_favorite", !book.is_favorite)}
              >
                Favorite
              </Badge>
            </div>
          )}

          <Separator />

          {/* Editable ISBN */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ISBN</label>
            {editingIsbn ? (
              <div className="space-y-2">
                <Input
                  placeholder="ISBN..."
                  value={isbnDraft}
                  onChange={(e) => setIsbnDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingIsbn(false);
                    } else if (e.key === "Enter") {
                      const trimmed = isbnDraft.trim();
                      handleFieldUpdate("isbn", trimmed || null);
                      setEditingIsbn(false);
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      const trimmed = isbnDraft.trim();
                      handleFieldUpdate("isbn", trimmed || null);
                      setEditingIsbn(false);
                    }}
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                  <button
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => setEditingIsbn(false)}
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{book.isbn ?? "—"}</span>
                <button
                  className="rounded p-1 hover:bg-muted"
                  onClick={() => {
                    setIsbnDraft(book.isbn ?? "");
                    setEditingIsbn(true);
                  }}
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {/* Bookshop.org link (wishlist only — reader doesn't need a buy link for books they own) */}
          {book.isbn && book.status === "wishlist" && (
            <a
              href={`https://bookshop.org/books?keywords=${book.isbn}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Buy on Bookshop.org
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Discuss this book */}
          <button
            onClick={() => openPanel({ bookTitle: book.title })}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Discuss this book
          </button>

          <Separator />

          {/* Delete book */}
          {confirmingDelete ? (
            <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">Remove this book from your library?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteBook}
                  className="rounded-md bg-destructive px-3 py-1 text-xs text-white hover:bg-destructive/90"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove from library
            </button>
          )}
        </div>

        {/* Right column: AI insights + Metadata */}
        <div className="space-y-6">
          {/* Predicted Rating Card (unread only) */}
          {showPredictedRating && (
            <Card className="border-amber-200/50 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4 text-amber-500" />
                  Predicted Rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                {book.predicted_rating != null ? (
                  <div className="space-y-2">
                    <p className="text-2xl font-semibold">★ {formatRating(book.predicted_rating)}</p>
                    {book.predicted_rationale && (
                      <p className="text-sm text-muted-foreground italic">
                        "{book.predicted_rationale}"
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No predicted rating yet
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {book.summary && (
            <div>
              <h2 className="mb-2 font-semibold">Summary</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {book.summary}
              </p>
            </div>
          )}

          {/* Vibes */}
          <VibeEditor bookId={book.id} />

          {/* Awards */}
          {awards.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Awards</h2>
              <div className="flex flex-wrap gap-2">
                {awards.map((award) => {
                  const label = `${award.award_short_name} ${award.status.charAt(0).toUpperCase() + award.status.slice(1)}${award.year ? ` ${award.year}` : ""}`;
                  const isWinner = award.status === "winner";
                  return (
                    <Badge
                      key={award.id}
                      variant={isWinner ? "default" : "outline"}
                      className={
                        isWinner
                          ? "bg-amber-600 hover:bg-amber-600 text-white"
                          : "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400"
                      }
                      title={award.award_name}
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                {book.genre && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Genre</dt>
                    <dd>{book.genre}</dd>
                  </div>
                )}

                {book.category && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Category</dt>
                    <dd>{book.category}</dd>
                  </div>
                )}

                {book.page_count && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Pages</dt>
                    <dd>{book.page_count.toLocaleString()}</dd>
                  </div>
                )}

                {book.publication_year && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Published</dt>
                    <dd>{book.publication_year}</dd>
                  </div>
                )}

                {book.publisher && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Publisher</dt>
                    <dd>{book.publisher}</dd>
                  </div>
                )}

                {book.format && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Format</dt>
                    <dd>{book.format}</dd>
                  </div>
                )}

                {book.date_started && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Date Started</dt>
                    <dd>{formatDate(book.date_started)}</dd>
                  </div>
                )}

                {book.date_finished && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Date Finished</dt>
                    <dd>{formatDate(book.date_finished)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full-width Notes Section */}
      <Separator />

      <div className="space-y-6">
        {/* Personal Notes */}
        <div>
          <h2 className="mb-2 font-semibold">Notes</h2>
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                rows={6}
                autoFocus
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingNotes(false);
                  }
                }}
                placeholder="Personal notes about this book..."
              />
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    const trimmed = notesDraft.trim();
                    handleFieldUpdate("notes", trimmed || null);
                    setEditingNotes(false);
                  }}
                >
                  Save
                </button>
                <button
                  className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                  onClick={() => setEditingNotes(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="cursor-pointer rounded-md px-1 py-2 -mx-1 hover:bg-muted/50 min-h-[60px]"
              onClick={() => {
                setNotesDraft(book.notes ?? "");
                setEditingNotes(true);
              }}
            >
              {book.notes ? (
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {book.notes}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Click to add personal notes...
                </p>
              )}
            </div>
          )}
        </div>

        {/* From Conversations */}
        <div>
          <h2 className="mb-2 font-semibold">From Conversations</h2>
          {excerptsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : excerpts.length === 0 ? (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Insights from your AI reading companion conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {excerpts.map((excerpt) => (
                <div
                  key={excerpt.id}
                  className="group flex items-start gap-3 rounded-md border bg-muted/20 px-4 py-3"
                >
                  <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{excerpt.content}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(excerpt.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {excerpt.conversation_id && (
                        <>
                          <span>·</span>
                          <Link
                            to="/chat"
                            className="hover:text-foreground hover:underline"
                          >
                            View conversation
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    onClick={() => handleDeleteExcerpt(excerpt.id)}
                    title="Delete excerpt"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
