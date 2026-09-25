-- Applied to production 2026-09-25.
-- Record-keeping tables: each is written only by the person whose action it
-- records, and the facts in it can't be rewritten afterwards.
--
-- Before (found 2026-09-23/25): any signed-in member could write
--   bounty_approval_workflows, approval_signatures_audit (ALL true),
--   treasury_transactions (INSERT/UPDATE true), event_tokens (ALL true),
--   pod_application_votes (INSERT true), bid_reviews (INSERT/UPDATE true),
--   and pod_membership_applications ("Allow application updates": any
--   member could change any application's status and vote count).
-- None of these moves money or grants authority by itself (the chain and
-- the chain-checked server routes do), but they are what members and
-- managers read as the record, so forged rows mislead people who then sign.
--
-- After:
--   bounty_approval_workflows  bounty managers create/update; an approval
--                              can only add the caller's own wallet; the
--                              terms (bounty, type, threshold, proposer,
--                              required count, operation) are fixed.
--   approval_signatures_audit  append-only, approver = caller.
--   treasury_transactions      pod leaders, as sender, record; afterwards
--                              only the confirmation fields change, and
--                              only while pending.
--   event_tokens               the event's organizers record; no edits.
--   pod_application_votes      a leader of the application's pod votes as
--                              themselves.
--   pod_membership_applications applicant files own (pending, no votes);
--                              leaders decide; votes and voting_leaders
--                              only grow by the caller's own vote.
--   bid_reviews                bounty managers review as themselves.

begin;

-- ── bounty_approval_workflows ───────────────────────────────────────────
drop policy if exists "allow_all_for_authenticated" on public.bounty_approval_workflows;
drop policy if exists "Authenticated users can create bounty approvals" on public.bounty_approval_workflows;
drop policy if exists "Users can delete bounty approvals they created" on public.bounty_approval_workflows;
drop policy if exists "Users can update bounty approvals they're involved in" on public.bounty_approval_workflows;
drop policy if exists "Bounty managers create approval workflows" on public.bounty_approval_workflows;
drop policy if exists "Bounty managers update approval workflows" on public.bounty_approval_workflows;
create policy "Bounty managers create approval workflows" on public.bounty_approval_workflows
  for insert to authenticated
  with check (public.is_bounty_manager(bounty_id) and public.is_my_wallet(proposed_by));
create policy "Bounty managers update approval workflows" on public.bounty_approval_workflows
  for update to authenticated
  using (public.is_bounty_manager(bounty_id))
  with check (public.is_bounty_manager(bounty_id));

create or replace function public.bounty_approval_workflows_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bad text[];
  added text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['current_approvals', 'approval_signatures', 'status',
                               'updated_at', 'executed_at', 'executed_by'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Approval terms cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  -- Approvals only grow, and only by the caller's own wallet.
  if not (coalesce(old.current_approvals, '{}') <@ coalesce(new.current_approvals, '{}')) then
    raise exception 'Approvals cannot be removed' using errcode = '42501';
  end if;
  added := array(select unnest(coalesce(new.current_approvals, '{}'))
                 except select unnest(coalesce(old.current_approvals, '{}')));
  if exists (select 1 from unnest(added) a where not public.is_my_wallet(a)) then
    raise exception 'You can only add your own approval' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'executed')
     and cardinality(coalesce(new.current_approvals, '{}')) < coalesce(new.required_approvals, 1) then
    raise exception 'Not enough approvals' using errcode = '42501';
  end if;
  if new.executed_by is distinct from old.executed_by and not public.is_my_wallet(new.executed_by) then
    raise exception 'executed_by must be your own wallet' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bounty_approval_workflows_guard on public.bounty_approval_workflows;
create trigger trg_bounty_approval_workflows_guard
  before update on public.bounty_approval_workflows
  for each row execute function public.bounty_approval_workflows_guard();

-- ── approval_signatures_audit ───────────────────────────────────────────
drop policy if exists "allow_all_for_authenticated" on public.approval_signatures_audit;
drop policy if exists "Users can insert own signatures" on public.approval_signatures_audit;
create policy "Users can insert own signatures" on public.approval_signatures_audit
  for insert to authenticated
  with check (public.is_my_wallet(approver_address));

-- ── treasury_transactions ───────────────────────────────────────────────
drop policy if exists "Treasury transactions can be inserted by authenticated users" on public.treasury_transactions;
drop policy if exists "Treasury transactions can be updated by authenticated users" on public.treasury_transactions;
drop policy if exists "Users can create treasury transactions" on public.treasury_transactions;
drop policy if exists "Users can update treasury transactions" on public.treasury_transactions;
drop policy if exists "Pod leaders record treasury transactions" on public.treasury_transactions;
drop policy if exists "Pod leaders confirm treasury transactions" on public.treasury_transactions;
create policy "Pod leaders record treasury transactions" on public.treasury_transactions
  for insert to authenticated
  with check (public.is_my_wallet(sender_address) and public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders confirm treasury transactions" on public.treasury_transactions
  for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));

create or replace function public.treasury_transactions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'A confirmed or failed treasury record is final' using errcode = '42501';
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'tx_hash', 'block_number', 'block_timestamp',
                               'gas_used', 'updated_at'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Treasury record details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_treasury_transactions_guard on public.treasury_transactions;
create trigger trg_treasury_transactions_guard
  before insert or update on public.treasury_transactions
  for each row execute function public.treasury_transactions_guard();

-- ── event_tokens ────────────────────────────────────────────────────────
drop policy if exists "System can manage event tokens" on public.event_tokens;
drop policy if exists "Organizers record event tokens" on public.event_tokens;
create policy "Organizers record event tokens" on public.event_tokens
  for insert to authenticated
  with check (public.is_event_organizer(event_id));

-- ── pod_application_votes ───────────────────────────────────────────────
drop policy if exists "Authenticated users can record votes" on public.pod_application_votes;
drop policy if exists "Pod leaders record their own votes" on public.pod_application_votes;
create policy "Pod leaders record their own votes" on public.pod_application_votes
  for insert to authenticated
  with check (
    public.is_my_wallet(voter_address)
    and exists (
      select 1 from public.pod_membership_applications a
      where a.id = application_id and public.is_pod_leader_current_user(a.pod_id)
    )
  );

-- ── pod_membership_applications ─────────────────────────────────────────
drop policy if exists "Allow application updates" on public.pod_membership_applications;
drop policy if exists "Authenticated users can submit applications" on public.pod_membership_applications;
drop policy if exists "Members file their own applications" on public.pod_membership_applications;
create policy "Members file their own applications" on public.pod_membership_applications
  for insert to authenticated
  with check (public.is_my_wallet(applicant_address));
-- "pod_leaders_can_update_applications" stays: leaders decide applications.

create or replace function public.pod_membership_applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added text[];
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.current_votes := 0;
    new.voting_leaders := '{}';
    new.approved_at := null;
    new.rejected_at := null;
    new.required_votes := greatest(coalesce(new.required_votes, 1), 1);
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'current_votes', 'voting_leaders', 'approved_at',
                               'rejected_at', 'rejection_reason', 'metadata'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Application details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  if not (coalesce(old.voting_leaders, '{}') <@ coalesce(new.voting_leaders, '{}')) then
    raise exception 'Votes cannot be removed' using errcode = '42501';
  end if;
  added := array(select distinct lower(x) from unnest(coalesce(new.voting_leaders, '{}')) x
                 except select lower(y) from unnest(coalesce(old.voting_leaders, '{}')) y);
  if exists (select 1 from unnest(added) a where not public.is_my_wallet(a)) then
    raise exception 'You can only add your own vote' using errcode = '42501';
  end if;
  -- The count is derived, never supplied.
  new.current_votes := (select count(distinct lower(x)) from unnest(coalesce(new.voting_leaders, '{}')) x);
  return new;
end;
$$;
drop trigger if exists trg_pod_membership_applications_guard on public.pod_membership_applications;
create trigger trg_pod_membership_applications_guard
  before insert or update on public.pod_membership_applications
  for each row execute function public.pod_membership_applications_guard();

-- ── bid_reviews ─────────────────────────────────────────────────────────
drop policy if exists "Anyone can create bid reviews" on public.bid_reviews;
drop policy if exists "Anyone can update bid reviews" on public.bid_reviews;
drop policy if exists "Bounty managers review bids" on public.bid_reviews;
drop policy if exists "Reviewers update their reviews" on public.bid_reviews;
create policy "Bounty managers review bids" on public.bid_reviews
  for insert to authenticated
  with check (
    public.is_my_wallet(reviewer_address)
    and exists (select 1 from public.bids b where b.id = bid_id and public.is_bounty_manager(b.bounty_id))
  );
create policy "Reviewers update their reviews" on public.bid_reviews
  for update to authenticated
  using (public.is_my_wallet(reviewer_address))
  with check (
    public.is_my_wallet(reviewer_address)
    and exists (select 1 from public.bids b where b.id = bid_id and public.is_bounty_manager(b.bounty_id))
  );

commit;
