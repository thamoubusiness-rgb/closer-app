-- Closer: initial schema + Row Level Security
-- Apply with: supabase db push

-- ───────── Core tables ─────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','agent')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  price numeric(14,2) check (price >= 0),
  currency text not null default 'EUR',
  location text,
  address text,
  property_type text,
  bedrooms int check (bedrooms >= 0),
  bathrooms numeric(3,1) check (bathrooms >= 0),
  area_sqm numeric(8,2) check (area_sqm >= 0),
  availability_status text not null default 'available'
    check (availability_status in ('available','reserved','sold','unavailable')),
  url text,
  photos jsonb not null default '[]'::jsonb,
  approved boolean not null default true,  -- importer sets false until a human approves
  import_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  email text,
  phone text,
  source text,
  status text not null default 'NEW'
    check (status in ('NEW','QUALIFYING','QUALIFIED','VIEWING_BOOKED','FOLLOW_UP','CONVERTED','LOST')),
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  preferred_location text,
  property_type text,
  bedrooms int,
  timeline text,
  financing_type text,
  notes text,
  assigned_agent_id uuid references public.users(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('website','whatsapp')),
  status text not null default 'open' check (status in ('open','closed')),
  ai_enabled boolean not null default true,
  handoff_requested boolean not null default false,
  widget_session_id text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','ai','human','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,  -- property ids, tool calls, booking info, channel
  created_at timestamptz not null default now()
);

create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  calendar_event_id text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','completed','no_show')),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  scheduled_for timestamptz not null,
  message text not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','cancelled')),
  created_at timestamptz not null default now()
);

create table public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  company_name text,
  tone text not null default 'professional' check (tone in ('professional','friendly','concise')),
  languages text[] not null default array['English'],
  qualification_fields text[] not null default array['budget','location','property_type','bedrooms'],
  human_handoff_enabled boolean not null default true,
  follow_up_enabled boolean not null default true,
  follow_up_delay_hours int not null default 24 check (follow_up_delay_hours > 0),
  follow_up_max_count int not null default 2 check (follow_up_max_count between 0 and 5),
  instructions text not null default
    'Always be professional and helpful. Never invent property information. Only use information available in the property database. If you don''t know the answer, tell the customer that an agent can confirm it. Your goal is to qualify the lead and help book a property viewing.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────── Integrations, billing, widget, analytics, usage ─────────
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('website_chat','whatsapp','google_calendar','stripe')),
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  config jsonb not null default '{}'::jsonb,  -- never store secrets here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','business')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','incomplete')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  google_email text,
  calendar_id text,
  calendar_name text,
  access_token_encrypted text,   -- encrypt (AES-GCM) in app code before insert
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  phone_number_id text not null unique,  -- webhook lookup key
  waba_id text,
  display_phone text,
  access_token_encrypted text,
  status text not null default 'connected' check (status in ('connected','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.website_widgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  public_id text not null unique default replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  allowed_domains text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.org_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period date not null,  -- first day of month
  messages int not null default 0,
  ai_responses int not null default 0,
  leads int not null default 0,
  viewings int not null default 0,
  follow_ups int not null default 0,
  unique (organization_id, period)
);

-- ───────── Indexes ─────────
create index on public.organization_members (user_id);
create index on public.properties (organization_id, availability_status, price);
create index on public.leads (organization_id, status);
create index on public.leads (organization_id, last_activity_at desc);
create unique index leads_org_phone on public.leads (organization_id, phone) where phone is not null;
create unique index leads_org_email on public.leads (organization_id, email) where email is not null;
create index on public.conversations (organization_id, last_message_at desc);
create unique index conv_org_session on public.conversations (organization_id, widget_session_id) where widget_session_id is not null;
create unique index conv_one_open on public.conversations (lead_id, channel) where status = 'open';
create index on public.messages (conversation_id, created_at);
create index on public.viewings (organization_id, start_time);
create unique index viewings_no_double_book on public.viewings (property_id, start_time) where status = 'scheduled';
create index follow_ups_due on public.follow_ups (scheduled_for) where status = 'scheduled';
create index on public.analytics_events (organization_id, name, created_at);

-- ───────── Triggers ─────────
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','properties','leads','conversations','ai_settings',
    'integrations','subscriptions','calendar_connections','whatsapp_connections','website_widgets']
  loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── Helpers ─────────
create or replace function public.is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where organization_id = org and user_id = auth.uid())
$$;

create or replace function public.is_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members
    where organization_id = org and user_id = auth.uid() and role in ('owner','admin'))
$$;

-- Called by the server right after signup. Org is derived from auth.uid(), never from the client.
create or replace function public.create_organization(p_name text, p_website text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); org uuid; base text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'agency'; end if;
  insert into organizations (name, slug, website)
    values (p_name, base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), p_website)
    returning id into org;
  insert into organization_members (organization_id, user_id, role) values (org, uid, 'owner');
  insert into ai_settings (organization_id, company_name) values (org, p_name);
  insert into subscriptions (organization_id, plan, status, trial_ends_at)
    values (org, 'trial', 'trialing', now() + interval '14 days');
  insert into website_widgets (organization_id) values (org);
  return org;
end $$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ───────── Row Level Security ─────────
do $$
declare t text;
begin
  foreach t in array array['organizations','users','organization_members','properties','leads',
    'conversations','messages','viewings','follow_ups','ai_settings','integrations','subscriptions',
    'calendar_connections','whatsapp_connections','website_widgets','analytics_events','org_usage']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Organizations and membership
create policy org_select on public.organizations for select using (public.is_member(id));
create policy org_update on public.organizations for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy members_select on public.organization_members for select using (public.is_member(organization_id));
create policy members_insert on public.organization_members for insert with check (public.is_admin(organization_id));
create policy members_update on public.organization_members for update using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));
create policy members_delete on public.organization_members for delete using (public.is_admin(organization_id));

-- Profiles: yourself, or people in your organizations
create policy users_select on public.users for select using (
  id = auth.uid() or exists (
    select 1 from organization_members a join organization_members b using (organization_id)
    where a.user_id = auth.uid() and b.user_id = users.id));
create policy users_update on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- Day-to-day data: every member can read and write within their own organization
do $$
declare t text;
begin
  foreach t in array array['properties','leads','conversations','messages','viewings','follow_ups']
  loop
    execute format('create policy %1$s_select on public.%1$I for select using (public.is_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (public.is_member(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update using (public.is_member(organization_id)) with check (public.is_member(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete using (public.is_member(organization_id))', t);
  end loop;
end $$;

-- Settings: members read, owners/admins write
do $$
declare t text;
begin
  foreach t in array array['ai_settings','integrations','website_widgets']
  loop
    execute format('create policy %1$s_select on public.%1$I for select using (public.is_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (public.is_admin(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update using (public.is_admin(organization_id)) with check (public.is_admin(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete using (public.is_admin(organization_id))', t);
  end loop;
end $$;

-- Read-only for members; written only by the server with the service role
do $$
declare t text;
begin
  foreach t in array array['subscriptions','calendar_connections','whatsapp_connections','analytics_events','org_usage']
  loop
    execute format('create policy %1$s_select on public.%1$I for select using (public.is_member(organization_id))', t);
  end loop;
end $$;

-- ───────── Grants ─────────
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.subscriptions, public.calendar_connections,
  public.whatsapp_connections, public.analytics_events, public.org_usage from authenticated;

-- Encrypted tokens must never reach the browser: expose safe columns only
revoke select on public.calendar_connections, public.whatsapp_connections from authenticated;
grant select (id, organization_id, google_email, calendar_id, calendar_name, status, created_at, updated_at)
  on public.calendar_connections to authenticated;
grant select (id, organization_id, phone_number_id, waba_id, display_phone, status, created_at, updated_at)
  on public.whatsapp_connections to authenticated;
