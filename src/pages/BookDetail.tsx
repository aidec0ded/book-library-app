import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MONTH_NAMES } from "@/lib/timing";
import { VibeEditor } from "@/components/VibeEditor";
import { updateBook } from "@/lib/books";
import type { Book } from "@/lib/types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const STATUS_OPTIONS = ["unread", "reading", "read", "unfinished"] as const;

const RATING_OPTIONS: { label: string; value: string }[] = [
  { label: "Unrated", value: "unrated" },
  ...Array.from({ length: 10 }, (_, i) => {
    const v = (10 - i) * 0.5;
    return { label: `\u2605 ${v.toFixed(1)}`, value: v.toString() };
  }),
];

type EditableField = "notes";

function EditableTextField({
  label,
  value,
  field,
  saving,
  editingField,
  onStartEdit,
  onSave,
  onCancel,
}: {
  label: string;
  value: string | null;
  field: EditableField;
  saving: string | null;
  editingField: string | null;
  onStartEdit: (field: EditableField, currentValue: string) => void;
  onSave: (field: EditableField, value: string) => void;
  onCancel: () => void;
}) {
  const isEditing = editingField === field;
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (isEditing) {
      setDraft(value ?? "");
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <Textarea
          className="mt-1"
          rows={5}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
            onClick={() => onSave(field, draft)}
          >
            Save
          </button>
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">
        {label}
        {saving === field && (
          <span className="ml-2 text-xs text-muted-foreground">Saving...</span>
        )}
      </h3>
      <div
        className="mt-0.5 cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50"
        onClick={() => onStartEdit(field, value ?? "")}
      >
        {value ? (
          <p className={field === "notes" ? "whitespace-pre-line text-sm leading-relaxed" : ""}>
            {value}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Click to add...</p>
        )}
      </div>
    </div>
  );
}

export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <Link
        to={-1 as unknown as string}
        onClick={(e) => {
          e.preventDefault();
          window.history.back();
        }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back
      </Link>

      {/* Save error banner */}
      {saveError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* Hero area */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {book.cover_image_url && (
          <div className="shrink-0 self-center sm:self-start">
            <img
              src={book.cover_image_url}
              alt={`Cover of ${book.title}`}
              className="h-auto w-48 rounded-lg shadow-md sm:w-40"
              loading="lazy"
            />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{book.title}</h1>
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
          <div className="flex flex-wrap items-center gap-2">
            {/* Status dropdown */}
            <Select
              value={book.status ?? "unread"}
              onValueChange={(val) => handleFieldUpdate("status", val)}
            >
              <SelectTrigger size="sm">
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

            {/* Favorite toggle */}
            <Badge
              variant={book.is_favorite ? "default" : "outline"}
              className={`cursor-pointer select-none ${!book.is_favorite ? "opacity-50 hover:opacity-80" : ""}`}
              onClick={() => handleFieldUpdate("is_favorite", !book.is_favorite)}
            >
              Favorite
            </Badge>

            {/* Up Next toggle */}
            <Badge
              variant={book.is_up_next ? "default" : "outline"}
              className={`cursor-pointer select-none ${!book.is_up_next ? "opacity-50 hover:opacity-80" : ""}`}
              onClick={() => handleFieldUpdate("is_up_next", !book.is_up_next)}
            >
              Up Next
            </Badge>
          </div>
          {/* Rating dropdown */}
          <div className="flex items-center gap-2">
            <Select
              value={ratingDisplayValue}
              onValueChange={(val) =>
                handleFieldUpdate("rating", val === "unrated" ? null : parseFloat(val))
              }
            >
              <SelectTrigger size="sm">
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
        </div>
      </div>

      <Separator />

      {/* Personalized card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personalized</CardTitle>
          <CardDescription>AI insights and personal notes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(book.status === "unread" || book.status === null) && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Predicted Rating</h3>
              {book.predicted_rating != null ? (
                <p className="mt-0.5 text-lg">{"\u2605"} {book.predicted_rating.toFixed(1)}</p>
              ) : (
                <p className="mt-0.5 text-sm italic text-muted-foreground">No predicted rating yet</p>
              )}
            </div>
          )}
          <EditableTextField
            label="Notes"
            value={book.notes}
            field="notes"
            saving={saving}
            editingField={editingField}
            onStartEdit={(field) => setEditingField(field)}
            onSave={(field, draft) => {
              const trimmed = draft.trim();
              setEditingField(null);
              handleFieldUpdate(field, trimmed || null);
            }}
            onCancel={() => setEditingField(null)}
          />
        </CardContent>
      </Card>

      <VibeEditor bookId={book.id} />

      {/* Metadata card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {book.genre && <Section label="Genre">{book.genre}</Section>}

            {book.category && (
              <Section label="Category">{book.category}</Section>
            )}

            {book.timing_raw && (
              <Section label="When to Read">
                {book.timing_raw}
                {book.timing_month && (
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    ({MONTH_NAMES[book.timing_month - 1]}
                    {book.timing_position ? `, ${book.timing_position}` : ""})
                  </span>
                )}
              </Section>
            )}

            {book.isbn && <Section label="ISBN">{book.isbn}</Section>}

            {book.page_count && (
              <Section label="Pages">
                {book.page_count.toLocaleString()}
              </Section>
            )}

            {book.publisher && (
              <Section label="Publisher">{book.publisher}</Section>
            )}

            {book.publication_year && (
              <Section label="Published">{book.publication_year}</Section>
            )}

            {book.format && (
              <Section label="Format">{book.format}</Section>
            )}

            {book.date_started && (
              <Section label="Date Started">
                {formatDate(book.date_started)}
              </Section>
            )}
            {book.date_finished && (
              <Section label="Date Finished">
                {formatDate(book.date_finished)}
              </Section>
            )}
          </dl>
        </CardContent>
      </Card>

      {book.summary && (
        <>
          <Separator />
          <div>
            <h2 className="mb-2 font-semibold">Summary</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {book.summary}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
