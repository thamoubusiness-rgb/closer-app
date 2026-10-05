import AuthForm from "@/app/auth/AuthForm";

export const metadata = { title: "Log in — Closer" };

export default function Page() {
  return (
    <main className="auth">
      <a href="/" className="logo">Closer</a>
      <h1 style={{ marginTop: 32 }}>Log in</h1>
      <AuthForm mode="login" />
    </main>
  );
}
