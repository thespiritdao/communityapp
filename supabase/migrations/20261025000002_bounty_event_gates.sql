-- Bounty credential gates: event attendance.
--
-- A pod may gate a bounty on attendance at an event it organised. Gate rows
-- use token_type = 'event' with the event uuid in contract_address (same
-- shape as a pod gate). "Attended" = the member's registration is checked in
-- or completed; mirrors isAttendedRegistration() in
-- src/features/bounty/lib/eligibility.ts — keep the two in step.
--
-- Applied to production: 2026-10-25.

alter table public.bounty_token_gates
  drop constraint if exists bounty_token_gates_token_type_check;
alter table public.bounty_token_gates
  add constraint bounty_token_gates_token_type_check
  check (token_type in ('hat', 'erc20', 'erc721', 'pod', 'event'));

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
          null; -- malformed uuid: not satisfied
        end;
      elsif g.token_type = 'event' and g.contract_address is not null then
        begin
          if exists (
            select 1
            from public.event_registrations er
            where er.event_id = g.contract_address::uuid
              and lower(er.user_address) = v_wallet
              and (
                er.checked_in_at is not null
                or er.completed_at is not null
                or er.registration_status in ('checked_in', 'completed')
              )
          ) then
            return true;
          end if;
        exception when others then
          null; -- malformed uuid: not satisfied
        end;
      elsif g.token_type = 'hat' then
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
        if g.contract_address is null then
          has_unverifiable := true; -- legacy bigint-only row: browser decides
        end if;
      else
        has_unverifiable := true; -- erc20 / erc721: browser verifies on-chain
      end if;
    end loop;
    return has_unverifiable;
  end if;

  return true;
end;
$$;
revoke execute on function public.bounty_bid_allowed(uuid) from public, anon;
grant execute on function public.bounty_bid_allowed(uuid) to authenticated;
