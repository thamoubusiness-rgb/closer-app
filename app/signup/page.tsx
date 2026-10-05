import AuthForm from "@/app/auth/AuthForm";

export const metadata = { title: "Start your 14-day free trial — Closer" };

export default function Page() {
  return (
    <main className="auth">
      <a href="/" className="logo">Closer</a>
      <h1 style={{ marginTop: 32 }}>Start your 14-day free trial</h1>
      <p className="mut" style={{ marginBottom: 24 }}>No credit card required.</p>
      <AuthForm mode="signup" />
    </main>
  );
}
