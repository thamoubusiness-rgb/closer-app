import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

export interface Subscription { plan: string; status: string; trial_ends_at: string | null }

/** Returns the signed-in user and their organization. The organization always comes from the session, never from client input. */
export async function requireOrg() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase.from("organization_members")
    .select("role, organizations(id, name)").eq("user_id", user.id).limit(1).maybeSingle();
  const org = (member?.organizations ?? null) as { id: string; name: string } | null;
  if (!member || !org) redirect("/onboarding");

  const { data: sub } = await supabase.from("subscriptions")
    .select("plan,status,trial_ends_at").eq("organization_id", org.id).maybeSingle();
  return { supabase, user, org, role: member.role as string, sub: sub as Subscription | null };
}

export function trialDaysLeft(sub: Subscription | null): number | null {
  if (!sub || sub.status !== "trialing" || !sub.trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86_400_000));
}
