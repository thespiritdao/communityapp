-- Bounty credential gates: verify pod-role (hat) gates in the database.
--
-- Context (2026-10-25): the create form now offers, as credentials, the roles
-- defined by the pods the creator manages. A role gate is a Hats Protocol hat
-- id. Hat ids are uint256 and overflow bounty_token_gates.hat_id (bigint), so
-- the app stores a role gate as token_type = 'hat', hat_id = null and the hat
-- id (decimal or 0x-hex) in contract_address.
--
-- pod_members.hat_id and pod_role_permissions.token_address hold hat ids in
-- either 0x-hex (66 chars) or decimal form, so comparisons go through
-- hat_id_numeric(). bounty_bid_allowed() previously treated every non-pod gate
-- as "unverifiable, let the browser decide"; role gates are now checked here
-- against the member's own active pod_members row, which is the floor the
-- browser check sits on. ERC-20 / ERC-721 gates remain browser-verified.
--
-- Applied to production: 2026-10-25 (via pooler, see docs/secrets runbook).

-- ── hex-or-decimal hat id → numeric ───────────────────────────────────────
create or replace function public.hat_id_numeric(p text)
returns numeric
language plpgsql
immutable
strict
as $$
declare
  s text := lower(trim(p));
  n numeric := 0;
  i int;
  d int;
begin
  if s = '' then
    return null;
  end if;
  if left(s, 2) = '0x' then
    s := substr(s, 3);
    for i in 1..length(s) loop
      d := position(substr(s, i, 1) in '0123456789abcdef') - 1;
      if d < 0 then
        return null;
      end if;
      n := n * 16 + d;
    end loop;
    return n;
  end if;
  if s ~ '^[0-9]+$' then
    return s::numeric;
  end if;
  return null;
end;
$$;
revoke execute on function public.hat_id_numeric(text) from public, anon;
grant execute on function public.hat_id_numeric(text) to authenticated;

-- ── Can the signed-in member bid on this bounty? ────────────────────────────
create or replace function public.bounty_bid_allowed(p_bounty_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b record;
  g record;
  has_unverifiable boolean := false;
  v_wallet text := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
    ''
  ));
begin
  select id, required_pod_id, restriction_level, creator_address
    into b
  from public.bounties
  where id = p_bounty_id;
  if not found then
    return false;
  end if;

  if b.restriction_level = 'pod_members' then
    if b.required_pod_id is null then
      return true;
    end if;
    return public.is_pod_member_current_user(b.required_pod_id)
        or public.is_pod_leader_current_user(b.required_pod_id);
  end if;

  if b.restriction_level = 'token_holders' then
    for g in
      select token_type, contract_address, hat_id
      from public.bounty_token_gates
      where bounty_id = p_bounty_id
    loop
      if g.token_type = 'pod' and g.contract_address is not null then
        begin
          if public.is_pod_member_current_user(g.contract_address::uuid)
             or public.is_pod_leader_current_user(g.contract_address::uuid) then
            return true;
          end if;
        exception when others then
          -- malformed uuid: treat as not satisfied
          null;
        end;
      elsif g.token_type = 'hat' then
        -- Role gate: satisfied by the member's own active role hat.
        if exists (
          select 1
          from public.pod_members pm
          where pm.is_active = true
            and lower(pm.wallet) = v_wallet
            and pm.hat_id is not null
            and public.hat_id_numeric(pm.hat_id)
                = public.hat_id_numeric(coalesce(g.contract_address, g.hat_id::text))
        ) then
          return true;
        end if;
        -- Legacy rows with only a (truncated) bigint hat_id cannot be trusted
        -- either way; let the browser's on-chain check decide those.
        if g.contract_address is null then
          has_unverifiable := true;
        end if;
      else
        has_unverifiable := true;
      end if;
    end loop;
    -- No pod or role gate matched. If an on-chain gate exists the browser
    -- decides; otherwise the member is not eligible.
    return has_unverifiable;
  end if;

  -- 'public', 'invite_only' (unused) or null: any authenticated member.
  return true;
end;
$$;
revoke execute on function public.bounty_bid_allowed(uuid) from public, anon;
grant execute on function public.bounty_bid_allowed(uuid) to authenticated;
