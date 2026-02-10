import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client that acts as the authenticated user.
 * Uses the anon key + user's JWT so RLS policies scope queries to that user.
 */
export function createUserClient(authHeader: string | undefined): SupabaseClient {
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Missing authorization token");

  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * Extract user_id from a JWT without an API call.
 * The `sub` claim in a Supabase JWT is the user's UUID.
 */
export function getUserIdFromToken(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64").toString(),
  );
  return payload.sub as string;
}
