# Closer — build brief

Closer is an AI sales employee for real-estate agencies: it answers inbound leads, qualifies them, matches properties, books viewings, follows up, and hands off to a human. Full spec: `reference/spec.txt` (if missing, ask the owner). Keep the product small; do not add features outside the spec.

## What exists (written in a chat, NEVER compiled or run)
- `supabase/migrations/0001_init.sql` — all tables, RLS, `create_organization()` RPC, column-level grants hiding encrypted tokens.
- `supabase/migrations/0002_rate_limits.sql` — Postgres rate limiter (`rate_limit_hit`).
- `lib/ai/*` — agent (OpenAI tool calling), tools, prompts, context, types, `ai.test.ts` (vitest).
- `app/api/widget/message/route.ts` + `public/widget.js` — website chat widget and its API.
- `lib/supabase/admin.ts`, `lib/rate-limit.ts` — service-role client and DB-backed rate limiter.
- `content/landing.html` — approved landing page, served at `/` by `app/route.ts`. Later port to React components + Tailwind (same copy, dark mode, demo, Take over toggle). `app/[page]/page.tsx` holds honest placeholder pages: privacy, terms, login, signup, contact.

## Do first (Phase 0)
1. Project is scaffolded (Next 15, TS strict; `lint` is `tsc --noEmit`; Tailwind not installed yet). Run `npm install`.
2. Fix whatever fails: `npm run build`, `npm run lint`, `npm test`. Do not rewrite working code unnecessarily.
3. Apply migrations to a fresh Supabase project. Write RLS tests proving agency A cannot read agency B (all tables, plus token columns).
4. Confirm `OPENAI_MODEL` default in `lib/ai/agent.ts` is a current model.

## Then build in this order, verifying after each phase
2 Properties (CRUD, CSV import with preview/validation, website import with approval, `seed.sql`: Acme Realty, 20 properties, 10 leads, 5 conversations, 5 viewings, fictional).
3 Auth + onboarding + dashboard shell (signup calls `create_organization`; org always derived from session, never client input).
4 Inbox (3 panes, Take over / Return to AI sets `conversations.ai_enabled`), Leads, Overview metrics.
5 Widget: also show human replies (polling or Supabase Realtime); test the route.
6 Google Calendar: OAuth with state validation, encrypted tokens, implement `CalendarService` (`lib/ai/types.ts`), plug into `runAgent` deps. Add `organizations` timezone if needed.
7 WhatsApp: `/api/webhooks/whatsapp` with verify challenge + signature check, find/create lead and conversation, call `runAgent`, send reply.
8 Follow-ups: cron that sends due `follow_ups` (respect `ai_enabled`, max count, delay) + Resend emails for qualified lead / viewing booked / handoff (implement `Notifier`).
9 Stripe: checkout, customer portal, webhooks (verify signature), trial logic, monthly usage limits (`org_usage`).
10 PostHog events, a11y, loading/empty/error states, SEO, README, `.env.example`.

## Rules
- Never expose OpenAI/Stripe/Supabase service/Meta/Google secrets to the browser. Validate all input with Zod. Verify every webhook signature.
- Never fake functionality. Unconfigured integrations show a setup state.
- Landing page honesty: no invented stats, logos or testimonials. The "In development" / "Coming soon" labels and pricing bullets must be updated to match what actually ships.
- When a credential is needed, create the env var and tell the owner exactly what to get and where to put it.
- Do not declare done until the full flow works: signup, import properties, widget lead, AI qualifies and recommends, booking creates a calendar event, human takeover, follow-up, Stripe payment.
