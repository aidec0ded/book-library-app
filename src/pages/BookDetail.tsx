import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MONTH_NAMES } from "@/lib/timing";
import { VibeEditor } from "@/components/VibeEditor";
import type { Book } from "@/lib/types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatRating(rating: number | null): string {
  if (rating === null || rating === 0) return "Unrated";
  return "\u2605 " + rating.toFixed(1) + " / 5";
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

export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !book) {
    return (
      <div className="space-y-2">
        <div className="text-destructive">{error ?? "Book not found."}</div>
        <Link to="/" className="text-sm underline">
          Back to list
        </Link>
      </div>
    );
  }

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
          <div className="flex flex-wrap gap-2">
            {book.status && (
              <Badge
                variant={book.status === "reading" ? "default" : "secondary"}
              >
                {book.status}
              </Badge>
            )}
            {book.is_favorite && <Badge variant="default">Favorite</Badge>}
            {book.is_up_next && <Badge variant="outline">Up Next</Badge>}
          </div>
          <p className="text-sm font-medium">{formatRating(book.rating)}</p>
        </div>
      </div>

      <Separator />

      {/* Personalized card */}
      {(book.transformative_potential || book.canon_potential || book.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personalized</CardTitle>
            <CardDescription>Editorial notes and potential</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {book.transformative_potential && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Transformative Potential</h3>
                <p className="mt-0.5">{book.transformative_potential}</p>
              </div>
            )}
            {book.canon_potential && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Canon Potential</h3>
                <p className="mt-0.5">{book.canon_potential}</p>
              </div>
            )}
            {book.notes && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
                <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed">
                  {book.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
