"use client";

import { useActionState } from "react";
import { login, signup, type AuthState } from "./actions";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isLogin = mode === "login";
  const [state, action, pending] = useActionState<AuthState, FormData>(isLogin ? login : signup, undefined);
  return (
    <form action={action} noValidate>
      {!isLogin && (
        <label className="field">Your name
          <input name="name" type="text" autoComplete="name" />
        </label>
      )}
      <label className="field">Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">Password
        <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} required />
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
      <button className="btn" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Please wait…" : isLogin ? "Log in" : "Start free"}
      </button>
      <p className="mut" style={{ marginTop: 16 }}>
        {isLogin ? <>New to Closer? <a href="/signup" style={{ textDecoration: "underline" }}>Start free</a></>
          : <>Already have an account? <a href="/login" style={{ textDecoration: "underline" }}>Log in</a></>}
      </p>
    </form>
  );
}
