import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only. Uses the service role key: never import from client components. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_env_missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
