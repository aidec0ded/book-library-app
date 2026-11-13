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
 * Check a request's login token with Supabase and return who it belongs to. A token's
 * contents can't be trusted on their own: anyone can write a token naming another user,
 * and only its signature, which Supabase checks here, shows it's real.
 */
export async function authenticateRequest(
  authHeader: string | undefined,
): Promise<{ supabase: SupabaseClient; userId: string; createdAt: string }> {
  const supabase = createUserClient(authHeader);
  const token = authHeader!.replace("Bearer ", "");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authorization token");

  return { supabase, userId: data.user.id, createdAt: data.user.created_at };
}
