import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PersonalCanonEditor } from "@/components/PersonalCanonEditor";
import {
  fetchLatestProfile,
  fetchBooksByIds,
  updatePersonalCanon,
} from "@/lib/profile";
import type { Book, ReaderProfile as ReaderProfileType } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function Profile() {
  const [profile, setProfile] = useState<ReaderProfileType | null>(null);
  const [canonBooks, setCanonBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const p = await fetchLatestProfile();
        setProfile(p);
        if (p && p.profile_data.personal_canon.length > 0) {
          const books = await fetchBooksByIds(p.profile_data.personal_canon);
          setCanonBooks(books);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleCanonUpdate = useCallback(
    async (bookIds: string[]) => {
      if (!profile) return;

      // Optimistic update
      const prevBooks = canonBooks;
      const prevProfile = profile;

      try {
        const newBooks = await fetchBooksByIds(bookIds);
        setCanonBooks(newBooks);
        setProfile({
          ...profile,
          profile_data: { ...profile.profile_data, personal_canon: bookIds },
        });
        await updatePersonalCanon(profile.id, bookIds);
      } catch {
        setCanonBooks(prevBooks);
        setProfile(prevProfile);
      }
    },
    [profile, canonBooks],
  );

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Reader Profile</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No profile generated yet. Generate one by running:
            </p>
            <code className="mt-2 block rounded bg-muted px-3 py-2 text-sm">
              npx tsx scripts/generate-profile.ts --bootstrap
            </code>
            <p className="mt-3 text-sm text-muted-foreground">
              After using the chat for a while, run without --bootstrap to
              include conversation context.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile_data: data } = profile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reader Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last generated {formatDate(profile.generated_at)}
        </p>
      </div>

      {/* Reader Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reader Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-line text-sm leading-relaxed">
            {data.reader_identity}
          </div>
        </CardContent>
      </Card>

      {/* Thematic Pillars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thematic Pillars</CardTitle>
          <CardDescription>
            The clusters that define your reading taste
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.thematic_pillars.map((pillar, i) => (
            <div key={i}>
              <h3 className="font-medium">{pillar.name}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {pillar.description}
              </p>
              {pillar.example_books.length > 0 && (
                <p className="mt-1 text-sm italic text-muted-foreground">
                  {pillar.example_books.join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Taste Evolution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taste Evolution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Current Gravitational Pulls
            </h3>
            <div className="mt-1 whitespace-pre-line text-sm leading-relaxed">
              {data.taste_evolution.current_gravitational_pulls}
            </div>
          </div>

          {data.taste_evolution.shift_log.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Shift Log
              </h3>
              <ul className="mt-1 space-y-1">
                {data.taste_evolution.shift_log.map((shift, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-muted-foreground">
                      {new Date(shift.noted_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                      })}
                    </span>{" "}
                    {shift.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Consistent Throughlines
            </h3>
            <div className="mt-1 whitespace-pre-line text-sm leading-relaxed">
              {data.taste_evolution.consistent_throughlines}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emotional Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Emotional Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-line text-sm leading-relaxed">
            {data.emotional_patterns}
          </div>
        </CardContent>
      </Card>

      {/* Personal Canon */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Canon</CardTitle>
          <CardDescription>
            The books that define you as a reader
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalCanonEditor
            books={canonBooks}
            onUpdate={handleCanonUpdate}
          />
        </CardContent>
      </Card>

      {/* Reading Life Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reading Life Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.reading_life_snapshot.currently_reading.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Currently Reading
              </h3>
              <ul className="mt-1 space-y-0.5">
                {data.reading_life_snapshot.currently_reading.map(
                  (book, i) => (
                    <li key={i} className="text-sm">
                      {book}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {data.reading_life_snapshot.recently_finished.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Recently Finished
              </h3>
              <ul className="mt-1 space-y-0.5">
                {data.reading_life_snapshot.recently_finished.map(
                  (book, i) => (
                    <li key={i} className="text-sm">
                      {book}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          {data.reading_life_snapshot.reading_pace_description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Reading Pace
              </h3>
              <p className="mt-1 text-sm">
                {data.reading_life_snapshot.reading_pace_description}
              </p>
            </div>
          )}

          {Object.keys(data.reading_life_snapshot.status_breakdown).length >
            0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Library Breakdown
              </h3>
              <div className="mt-1 flex flex-wrap gap-3">
                {Object.entries(data.reading_life_snapshot.status_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <span key={status} className="text-sm">
                      <span className="font-medium">{count}</span>{" "}
                      <span className="text-muted-foreground">{status}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
