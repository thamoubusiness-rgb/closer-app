# Closer — your AI sales employee

Next.js 15 + Supabase + OpenAI. Deployable to Vercel. Status: landing page, AI agent core, website widget API and database schema are written; dashboard, auth, calendar, WhatsApp and Stripe are not (see CLAUDE.md).

## Deploy to Vercel
1. **Supabase:** create a project. In the SQL editor run `supabase/migrations/0001_init.sql`, then `0002_rate_limits.sql`.
2. **GitHub:** push this folder to a new repository.
3. **Vercel:** Add New Project, import the repo (framework: Next.js, no changes needed).
4. **Environment variables** (Vercel, Settings): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase, Project Settings, API), `OPENAI_API_KEY` (platform.openai.com), optional `OPENAI_MODEL`. Never expose the service role key.
5. Deploy. `/` shows the landing page; `/widget.js` serves the chat widget.

## Set up sign-in (Supabase)
Authentication, URL Configuration: set Site URL to your Vercel URL and add `YOUR_APP_URL/auth/callback` to Redirect URLs. For quick testing you can turn off "Confirm email" under Authentication, Providers, Email.

## Try it
1. Open `/signup`, create an account, then enter your agency name. This creates your organization with a 14-day trial.
2. Dashboard, Integrations: copy the website chat snippet and paste it into any HTML page.
3. To give the AI listings, add rows to the `properties` table in the Supabase table editor (set `organization_id` to yours).
Calendar booking returns "not connected" until Google Calendar is built.

## Local
`npm install`, copy `.env.example` to `.env.local`, then `npm run dev` / `npm run build` / `npm run lint` (type check) / `npm test`.
