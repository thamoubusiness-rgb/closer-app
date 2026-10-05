import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";

// Email confirmation link lands here, then we send the user to onboarding.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/onboarding`);
  }
  return NextResponse.redirect(`${origin}/login`);
}
