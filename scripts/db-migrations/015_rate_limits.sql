-- 015_rate_limits.sql
--
-- Postgres-backed rate limiting, replacing Upstash Redis (whose free-tier DB
-- was reclaimed for inactivity, taking Sensemaker down — see route fail-closed).
--
-- Fixed-window counters: one row per (key, window). The RPC atomically
-- increments and reports whether the caller is within the limit. Rows are
-- ephemeral; stale windows are deleted opportunistically on each call.
--
-- Access: service-role ONLY. RLS is enabled with no policies (service role
-- bypasses RLS), and EXECUTE on the RPC is revoked from anon/authenticated so
-- clients cannot burn counters or probe limits.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Floor "now" to the current fixed window so all hits in the same window
  -- share one row.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits as rl (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  -- Opportunistic cleanup: windows older than 2x the window size are dead.
  -- Cheap at this endpoint's volume; avoids needing pg_cron.
  delete from rate_limits
  where window_start < now() - make_interval(secs => p_window_seconds * 2);

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_window_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer)
  from public, anon, authenticated;
