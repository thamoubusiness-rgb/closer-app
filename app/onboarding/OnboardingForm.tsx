"use client";

import { useActionState } from "react";
import { createOrg, type OnboardingState } from "./actions";

export default function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createOrg, undefined);
  return (
    <form action={action} noValidate>
      <label className="field">Agency name
        <input name="name" type="text" autoComplete="organization" required />
      </label>
      <label className="field">Website
        <input name="website" type="url" placeholder="https://" autoComplete="url" />
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}
