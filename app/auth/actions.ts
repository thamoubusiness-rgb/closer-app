"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const creds = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(72) });

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const p = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!p.success) return { error: "Enter a valid email and a password of at least 8 characters." };
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword(p.data);
  if (error) return { error: "Incorrect email or password." };
  redirect("/dashboard");
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const p = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!p.success) return { error: "Enter a valid email and a password of at least 8 characters." };
  const fullName = String(form.get("name") ?? "").trim().slice(0, 100);
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    ...p.data,
    options: { data: { full_name: fullName }, emailRedirectTo: base ? `${base}/auth/callback` : undefined },
  });
  if (error) return { error: "Could not create the account. Try a different email or password." };
  if (!data.session) return { message: "Check your email to confirm your account, then log in." };
  redirect("/onboarding");
}

export async function logout() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/");
}
