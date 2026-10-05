"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string } | undefined;

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  website: z.string().trim().url().max(200).or(z.literal("")),
});

export async function createOrg(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const p = schema.safeParse({ name: form.get("name"), website: form.get("website") ?? "" });
  if (!p.success) return { error: "Enter your agency name. If you add a website, include https://." };
  const supabase = await serverClient();
  const { error } = await supabase.rpc("create_organization", { p_name: p.data.name, p_website: p.data.website || null });
  if (error) return { error: "Something went wrong. Please try again." };
  redirect("/dashboard");
}
