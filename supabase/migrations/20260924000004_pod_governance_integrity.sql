-- Applied to production 2026-09-24.
-- Pod governance: votes need an open proposal and an eligible voter;
-- proposal thresholds come from the pod's settings, not the browser.
--
-- Before (found 2026-09-24):
--   * governance_votes only checked the voter was the caller. Eligibility
--     (an active member of the pod wearing a role with
--     governanceParticipation, leaders only when the pod says so) was
--     checked in the browser alone, and close-proposals counts every row.
--     Votes were also accepted after the deadline and on closed proposals.
--   * pod_level_proposals INSERT was `true`: any member could open a
--     proposal in any pod, naming anyone as creator, with any approval and
--     quorum thresholds, electorate size and deadline. Those values are
--     frozen after insert and decide the result.
--   * proposal_eligibility_snapshots INSERT was `true` (token-gated pods;
--     no pod has it enabled and the table is empty).
--
-- After:
--   * is_eligible_pod_voter() mirrors getEligibleVoterWallets().
--   * Votes: own wallet, eligible, proposal open (proposed/active, before
--     its deadline), snapshot passed when the proposal has one. pod_id and
--     timestamp are set by the database; proposal and voter are fixed.
--   * Proposals from the browser: creator is the caller and may vote in the
--     pod (or leads it); status 'proposed'; thresholds are the pod's
--     settings (the form may only raise them); eligible_voter_count and the
--     deadline are computed here.
--   * Snapshots: only the proposal's creator, within 10 minutes of creating
--     it and before any vote.

begin;

create or replace function public.pod_tier_setting(p_pod_id uuid, p_tier text, p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_tier = 'POD_TREASURY_BINDING' then
      case p_key
        when 'quorum_bps' then coalesce(p.gov_treasury_quorum_bps, 5000)::text
        when 'approval_bps' then coalesce(p.gov_treasury_approval_bps, 6600)::text
        when 'voting_hours' then coalesce(p.gov_treasury_voting_hours, 72)::text
        when 'voter_base' then coalesce(p.gov_treasury_voter_base, 'all_members')
      end
    else
      case p_key
        when 'quorum_bps' then coalesce(p.gov_op_quorum_bps, 3000)::text
        when 'approval_bps' then coalesce(p.gov_op_approval_bps, 5001)::text
        when 'voting_hours' then coalesce(p.gov_op_voting_hours, 72)::text
        when 'voter_base' then coalesce(p.gov_op_voter_base, 'all_members')
      end
  end
  from public.pods p
  where p.id = p_pod_id;
$$;

create or replace function public.is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_tier, 'POD_OPERATIONAL') <> 'DAO_CONSTITUTIONAL'
    and exists (
      select 1
      from public.active_pod_members m
      join public.pod_role_permissions r
        on r.pod_id = m.pod_id::uuid
       and r.is_active
       and r.token_address = m.hat_id
       and r.permissions ->> 'governanceParticipation' = 'true'
      where m.pod_id::uuid = p_pod_id
        and lower(m.wallet) = lower(p_wallet)
        and (public.pod_tier_setting(p_pod_id, p_tier, 'voter_base') <> 'leaders'
             or m.membership_type in ('leader', 'admin'))
    );
$$;
revoke execute on function public.is_eligible_pod_voter(uuid, text, text) from public, anon;
grant execute on function public.is_eligible_pod_voter(uuid, text, text) to authenticated;

create or replace function public.can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pod_level_proposals pr
    where pr.id = p_proposal_id
      and pr.status in ('proposed', 'active')
      and (pr.voting_deadline is null or pr.voting_deadline > now())
      and public.is_eligible_pod_voter(pr.pod_id, pr.governance_tier, p_wallet)
      and (
        not exists (select 1 from public.proposal_eligibility_snapshots s where s.proposal_id = pr.id)
        or exists (
          select 1 from public.proposal_eligibility_snapshots s
          where s.proposal_id = pr.id and lower(s.wallet) = lower(p_wallet) and s.passed
        )
      )
  );
$$;
revoke execute on function public.can_vote_on_pod_proposal(uuid, text) from public, anon;
grant execute on function public.can_vote_on_pod_proposal(uuid, text) to authenticated;

-- ── governance_votes ────────────────────────────────────────────────────
drop policy if exists "governance_votes_insert_own" on public.governance_votes;
drop policy if exists "governance_votes_update_own" on public.governance_votes;
create policy "governance_votes_insert_own" on public.governance_votes
  for insert to authenticated
  with check (public.is_my_wallet(voter_address)
              and public.can_vote_on_pod_proposal(proposal_id, voter_address));
create policy "governance_votes_update_own" on public.governance_votes
  for update to authenticated
  using (public.is_my_wallet(voter_address))
  with check (public.is_my_wallet(voter_address)
              and public.can_vote_on_pod_proposal(proposal_id, voter_address));

create or replace function public.governance_votes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.proposal_id is distinct from old.proposal_id
          or lower(new.voter_address) is distinct from lower(old.voter_address)) then
    raise exception 'A vote cannot be moved to another proposal or voter' using errcode = '42501';
  end if;
  new.voter_address := lower(new.voter_address);
  new.pod_id := (select pod_id from public.pod_level_proposals where id = new.proposal_id);
  new.timestamp := now();
  return new;
end;
$$;
drop trigger if exists trg_governance_votes_guard on public.governance_votes;
create trigger trg_governance_votes_guard
  before insert or update on public.governance_votes
  for each row execute function public.governance_votes_guard();

-- ── pod_level_proposals ─────────────────────────────────────────────────
drop policy if exists "Authenticated users can create proposals" on public.pod_level_proposals;
drop policy if exists "Members create proposals in their pods" on public.pod_level_proposals;
create policy "Members create proposals in their pods" on public.pod_level_proposals
  for insert to authenticated
  with check (
    public.is_my_wallet(created_by)
    and pod_id is not null
    and (public.is_pod_leader_current_user(pod_id)
         or public.is_eligible_pod_voter(pod_id, governance_tier, created_by))
  );

create or replace function public.pod_level_proposals_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text := coalesce(new.governance_tier, 'POD_OPERATIONAL');
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if v_tier not in ('POD_OPERATIONAL', 'POD_TREASURY_BINDING') then
    raise exception 'Pod proposals are operational or treasury-binding' using errcode = '42501';
  end if;
  new.governance_tier := v_tier;
  new.created_by := lower(new.created_by);
  new.status := 'proposed';
  new.approval_threshold_bps := greatest(
    coalesce(new.approval_threshold_bps, 0),
    public.pod_tier_setting(new.pod_id, v_tier, 'approval_bps')::int);
  new.quorum_threshold_bps := greatest(
    coalesce(new.quorum_threshold_bps, 0),
    public.pod_tier_setting(new.pod_id, v_tier, 'quorum_bps')::int);
  new.voting_deadline := now()
    + make_interval(hours => public.pod_tier_setting(new.pod_id, v_tier, 'voting_hours')::int);
  new.eligible_voter_count := (
    select count(distinct lower(m.wallet))::int
    from public.active_pod_members m
    where m.pod_id::uuid = new.pod_id
      and public.is_eligible_pod_voter(new.pod_id, v_tier, m.wallet)
  );
  return new;
end;
$$;
drop trigger if exists trg_pod_level_proposals_insert_guard on public.pod_level_proposals;
create trigger trg_pod_level_proposals_insert_guard
  before insert on public.pod_level_proposals
  for each row execute function public.pod_level_proposals_insert_guard();

-- ── proposal_eligibility_snapshots ──────────────────────────────────────
drop policy if exists "proposal_eligibility_snapshots_insert" on public.proposal_eligibility_snapshots;
create policy "proposal_eligibility_snapshots_insert" on public.proposal_eligibility_snapshots
  for insert to authenticated
  with check (exists (
    select 1 from public.pod_level_proposals pr
    where pr.id = proposal_id
      and public.is_my_wallet(pr.created_by)
      and pr.created_at > now() - interval '10 minutes'
      and not exists (select 1 from public.governance_votes v where v.proposal_id = pr.id)
  ));

commit;
