-- Custom access token hook: the wallet claim comes from the database, not from
-- whoever built the token.
--
-- Supabase calls this function every time it issues an access token, before
-- signing. It receives { user_id, claims, authentication_method } and returns
-- { claims }. See docs/session-minting-design (the Claude doc) for why.
--
-- Two jobs:
--
-- 1. Compatibility. 67 row-security policy references read the wallet from a
--    top-level `wallet_address` claim. Supabase-issued tokens do not carry one,
--    so without this hook every one of those policies would match nothing the
--    moment sign-in moves onto Supabase-issued sessions. Silently.
--
-- 2. Authority. `user_metadata` is editable by the user through the auth API.
--    Verified 2026-09-21: a signed-in member can set
--    user_metadata.wallet_address to anyone's wallet and, after obtaining a
--    Supabase-issued token, 39 policy references trust it. This hook OVERWRITES
--    both the top-level claim and the metadata claim from the user's own row
--    on every issue, so a token cannot carry a wallet its user does not own,
--    whatever the user has written into their metadata.
--
-- Agents (community agent accounts) carry `agent_wallet` in app_metadata,
-- which only the service key can set. For those the hook stamps the narrow
-- `community_agent` database role and the agent's wallet.
--
-- Defensive by design: any failure returns the claims unchanged, because a
-- hook that throws stops every sign-in in the project.
--
-- Enabling (dashboard, cannot be done by SQL):
--   Authentication -> Hooks -> Customize Access Token -> public.custom_access_token_hook
--
-- Applied to production: 2026-09-21. Enabled in the dashboard: pending.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims       jsonb;
  uid          uuid;
  wallet       text;
  agent_wallet text;
  meta         jsonb;
begin
  claims := coalesce(event->'claims', '{}'::jsonb);

  begin
    uid := (event->>'user_id')::uuid;
  exception when others then
    return jsonb_build_object('claims', claims);
  end;

  -- Agent accounts: app_metadata is server-controlled, so this is trustworthy.
  agent_wallet := lower(nullif(claims->'app_metadata'->>'agent_wallet', ''));
  if agent_wallet is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb('community_agent'::text));
    claims := jsonb_set(claims, '{wallet_address}', to_jsonb(agent_wallet));
    return jsonb_build_object('claims', claims);
  end if;

  -- Members: the canonical linked wallet, else the profile wallet.
  select lower(w.wallet_address) into wallet
    from public.user_wallets w
   where w.user_id = uid and w.is_canonical
   limit 1;

  if wallet is null then
    select lower(p.wallet_address) into wallet
      from public.user_profiles p
     where p.user_id = uid and p.wallet_address is not null
     limit 1;
  end if;

  meta := coalesce(claims->'user_metadata', '{}'::jsonb);

  if wallet is not null then
    claims := jsonb_set(claims, '{wallet_address}', to_jsonb(wallet));
    claims := jsonb_set(claims, '{user_metadata}', meta || jsonb_build_object('wallet_address', wallet));
  else
    -- No wallet on record: make sure a user-supplied one cannot ride along.
    claims := claims - 'wallet_address';
    claims := jsonb_set(claims, '{user_metadata}', meta - 'wallet_address');
  end if;

  return jsonb_build_object('claims', claims);
exception when others then
  return jsonb_build_object('claims', coalesce(event->'claims', '{}'::jsonb));
end;
$$;

-- Supabase Auth runs the hook as supabase_auth_admin; nobody else may call it.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- What the hook reads.
grant select on table public.user_wallets to supabase_auth_admin;
grant select on table public.user_profiles to supabase_auth_admin;

comment on function public.custom_access_token_hook(jsonb) is
  'Stamps wallet_address (top-level and user_metadata) from user_wallets/user_profiles on every issued token; stamps role=community_agent for accounts carrying app_metadata.agent_wallet. Overwrites, never trusts, user metadata.';
