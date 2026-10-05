import type { SupabaseClient } from "@supabase/supabase-js";

/** Returns true if the call is allowed. Fails closed if the limiter itself errors. */
export async function rateLimit(
  db: SupabaseClient, key: string, windowSeconds: number, max: number,
): Promise<boolean> {
  const { data, error } = await db.rpc("rate_limit_hit", {
    p_key: key, p_window_seconds: windowSeconds, p_max: max,
  });
  return !error && data === true;
}
