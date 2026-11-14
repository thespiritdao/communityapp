-- Baseline step 0: prerequisites a fresh Supabase project does not have.
-- Run as the postgres role (Supabase SQL editor or psql), before 01_schema.sql.

-- Extensions used by the schema (uuid-ossp is usually enabled already).
create extension if not exists "uuid-ossp" with schema extensions;
-- hstore lives in public on the reference deployment; a trigger relies on it there.
create extension if not exists hstore with schema public;

-- Database role used by community agents (Congregant architecture). Agent
-- sessions carry role=community_agent, stamped by public.custom_access_token_hook;
-- RLS policies scope what that role can read and write.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'community_agent') then
    create role community_agent nologin;
  end if;
end
$$;
grant community_agent to authenticator;
grant usage on schema public to community_agent;
