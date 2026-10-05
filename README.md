# Closer — your AI sales employee

Next.js 15 + Supabase + OpenAI. Deployable to Vercel. Status: landing page, AI agent core, website widget API and database schema are written; dashboard, auth, calendar, WhatsApp and Stripe are not (see CLAUDE.md).

## Deploy to Vercel
1. **Supabase:** create a project. In the SQL editor run `supabase/migrations/0001_init.sql`, then `0002_rate_limits.sql`.
2. **GitHub:** push this folder to a new repository.
3. **Vercel:** Add New Project, import the repo (framework: Next.js, no changes needed).
4. **Environment variables** (Vercel, Settings): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase, Project Settings, API), `OPENAI_API_KEY` (platform.openai.com), optional `OPENAI_MODEL`. Never expose the service role key.
5. Deploy. `/` shows the landing page; `/widget.js` serves the chat widget.

## Test the widget
There is no signup yet, so create an organization by hand in the Supabase SQL editor: insert a row in `organizations`, one in `ai_settings`, one in `subscriptions` (status `active`) and one in `website_widgets`; copy its `public_id`. Then on any page:
`<script src="https://YOUR_APP_URL/widget.js" data-closer-id="PUBLIC_ID"></script>`
Add rows to `properties` so the AI has listings to search. Calendar booking returns "not connected" until Phase 6.

## Local
`npm install`, copy `.env.example` to `.env.local`, then `npm run dev` / `npm run build` / `npm run lint` (type check) / `npm test`.
