-- Bounty eligibility: one gate model, enforced where the database can.
--
-- Found 2026-10-20:
--   * The create route ignored the form's required_pod_id and always stored
--     the sponsor pod, so "DAO-wide" never worked.
--   * The browser's membership check read a pods.pod_members array that does
--     not exist, so ordinary pod members could never bid on their own pod's
--     bounties unless they held Advocate — and Advocate bypassed every pod
--     restriction.
--   * Eligibility was browser-only. bids are inserted directly under RLS,
--     which checked identity, not eligibility.
--
-- Gate model (bounties.restriction_level is the authority):
--   'public'        any member (Proof of Curiosity or Advocate, checked in the
--                   browser; the database accepts any authenticated member)
--   'pod_members'   members or leaders of bounties.required_pod_id
--   'token_holders' holders of ANY row in bounty_token_gates for the bounty:
--                     token_type 'pod'    contract_address = pod uuid (text);
--                                         membership, verified here
--                     token_type 'erc20'  contract_address = token; min_balance
--                                         in whole tokens; verified on-chain in
--                                         the browser only
--                     token_type 'erc721' contract_address = token; min_balance
--                                         = count; browser only
--                     token_type 'hat'    legacy; hat_id; browser only
--
-- Applied: 2026-10-20 via the us-east-1 pooler (verified: both existing
-- bounties backfilled to pod_members; bounty_bid_allowed granted to
-- authenticated; trg_pulse_bounty_created present; hat_id nullable).

begin;

-- ── bounty_token_gates: allow contract/pod gates without a hat id ──────────
alter table public.bounty_token_gates
  alter column hat_id drop not null;

alter table public.bounty_token_gates
  drop constraint if exists bounty_token_gates_token_type_check;
alter table public.bounty_token_gates
  add constraint bounty_token_gates_token_type_check
  check (token_type in ('hat', 'erc20', 'erc721', 'pod'));

-- The old write policies compared against a setting nothing sets; gates are
-- written by the server (service role) when the bounty is saved.
drop policy if exists "Token gates manageable by bounty creators" on public.bounty_token_gates;
drop policy if exists "Token gates updatable by bounty creators" on public.bounty_token_gates;
drop policy if exists "Token gates deletable by bounty creators" on public.bounty_token_gates;

-- ── Backfill: existing rows were pod-only in practice ───────────────────────
update public.bounties
set restriction_level = 'pod_members'
where required_pod_id is not null
  and (restriction_level is null or restriction_level = 'public');

-- ── Can the signed-in member bid on this bounty? ────────────────────────────
-- Returns true for anything the database cannot verify (on-chain credential
-- gates); the browser handles those. Never grants a pod-restricted bounty to
-- a non-member.
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
      select token_type, contract_address
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
      else
        has_unverifiable := true;
      end if;
    end loop;
    -- No pod gate matched. If an on-chain gate exists the browser decides;
    -- if every gate was a pod gate, the member is not eligible.
    return has_unverifiable;
  end if;

  -- 'public', 'invite_only' (unused) or null: any authenticated member.
  return true;
end;
$$;
revoke execute on function public.bounty_bid_allowed(uuid) from public, anon;
grant execute on function public.bounty_bid_allowed(uuid) to authenticated;

-- ── bids_guard: enforce eligibility on insert ───────────────────────────────
create or replace function public.bids_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[];
  bad text[];
  manager boolean;
  bidder boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.bounty_bid_allowed(new.bounty_id) then
      raise exception 'You are not eligible to bid on this bounty'
        using errcode = '42501';
    end if;
    new.status := 'pending';
    new.reviewer_address := null;
    new.final_approver_address := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    return new;
  end if;

  manager := public.is_bounty_manager(old.bounty_id);
  bidder := public.is_my_wallet(old.bidder_address);
  changed := public.changed_columns(to_jsonb(old), to_jsonb(new));

  bad := array(
    select unnest(changed)
    except select unnest(case when manager then
      array['status', 'reviewer_address', 'final_approver_address', 'reviewed_at', 'reviewed_by']
      else array[]::text[] end)
    except select unnest(case when bidder and old.status = 'pending' then
      array['experience', 'plan_of_action', 'deliverables', 'timeline', 'proposed_amount',
            'payment_option', 'payment_details', 'answers', 'additional_notes']
      else array[]::text[] end)
  );
  if cardinality(bad) > 0 then
    raise exception 'Not allowed to change bid fields: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- trigger trg_bids_guard already points at this function.

-- ── Pulse: bounty_created ───────────────────────────────────────────────────
-- Bids already surface in Pulse; the bounty itself did not. Same shape as
-- pulse_log_bid_placed; the body never raises.
create or replace function public.pulse_log_bounty_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if coalesce(new.status, 'open') <> 'draft' then
      insert into public.explorer_events (
        type, category, title, actor, url, pod_id, amount_value, amount_token, metadata, dedupe_key
      ) values (
        'bounty_created',
        'bounties',
        'New bounty: ' || coalesce(new.title, ''),
        lower(new.creator_address),
        '/bounty?bounty=' || new.id::text,
        new.pod_id,
        nullif(new.value_amount, '')::numeric,
        new.value_token,
        jsonb_build_object(
          'bounty_id', new.id,
          'category', new.category,
          'restriction_level', new.restriction_level,
          'required_pod_id', new.required_pod_id,
          'funding_source', new.funding_source
        ),
        'bounty_created:' || new.id::text
      );
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
revoke execute on function public.pulse_log_bounty_created() from public, anon, authenticated;
drop trigger if exists trg_pulse_bounty_created on public.bounties;
create trigger trg_pulse_bounty_created
  after insert on public.bounties
  for each row execute function public.pulse_log_bounty_created();

commit;
