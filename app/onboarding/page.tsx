import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";

export const metadata = { title: "Welcome — Closer" };

export default async function Page() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("organization_members").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (member) redirect("/dashboard");
  return (
    <main className="auth">
      <span className="logo">Closer</span>
      <h1 style={{ marginTop: 32 }}>Welcome to Closer.</h1>
      <p className="mut" style={{ marginBottom: 24 }}>Let’s get your AI sales employee ready.</p>
      <OnboardingForm />
    </main>
  );
}
