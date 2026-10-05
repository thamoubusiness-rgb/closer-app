-- Atomic fixed-window rate limiter that works on serverless (no in-memory state).
-- Used by public endpoints: widget, auth helpers, webhooks.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

alter table public.rate_limits enable row level security;  -- no policies: service role only
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end,
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else r.count + 1 end
  returning r.count into c;
  return c <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- Housekeeping: schedule with pg_cron or a Vercel cron
-- delete from public.rate_limits where window_start < now() - interval '1 day';
