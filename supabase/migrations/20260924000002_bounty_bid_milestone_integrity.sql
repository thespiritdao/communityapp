-- Applied to production 2026-09-24.
-- Bounties, bids and milestones: each person writes only what their role
-- in the flow writes.
--
-- Before (found 2026-09-23): INSERT and UPDATE were `true` on all three, so
-- any member could rewrite any bounty, bid or milestone. The values feed
-- what a manager signs: bids.onchain_bid_index picks who assignBounty pays,
-- milestones.payment_amount is what releasePayment releases.
--
-- Who writes what (mapped from every browser write, 2026-09-24):
--   bidder   inserts own bid (pending); edits its content while pending
--   manager  (bounty creator, or a lead of the bounty's pod) sets bid status
--            and reviewer fields, creates milestones for an approved bid,
--            marks milestones and the bounty assigned/completed,
--            sets bounties.payment_type
--   server   everything else (bounty creation, on-chain ids, work review)
--
-- The pre-sign checks in BountyAssignmentTransaction / MilestonePayment /
-- BountyPaymentTransaction compare these rows with BountyManager too; this
-- migration stops the rows being rewritten in the first place.

begin;

-- Two wallets belong to the same member (bids are placed on-chain from the
-- device wallet but recorded under the member's canonical wallet).
create or replace function public.wallets_same_member(a text, b text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(a) = lower(b)
    or exists (
      select 1
      from public.user_wallets x
      join public.user_wallets y on y.user_id = x.user_id
      where lower(x.wallet_address) = lower(a) and lower(y.wallet_address) = lower(b)
    )
    or exists (
      select 1
      from public.user_profiles up
      join public.user_wallets uw on uw.user_id = up.user_id
      where (lower(up.wallet_address) = lower(a) and lower(uw.wallet_address) = lower(b))
         or (lower(up.wallet_address) = lower(b) and lower(uw.wallet_address) = lower(a))
    );
$$;
revoke execute on function public.wallets_same_member(text, text) from public, anon;
grant execute on function public.wallets_same_member(text, text) to authenticated;

create or replace function public.is_bounty_manager(p_bounty_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bounties b
    where b.id = p_bounty_id
      and (public.is_my_wallet(b.creator_address)
           or (b.pod_id is not null and public.is_pod_leader_current_user(b.pod_id)))
  );
$$;
revoke execute on function public.is_bounty_manager(uuid) from public, anon;
grant execute on function public.is_bounty_manager(uuid) to authenticated;

-- Columns that differ between two versions of a row.
create or replace function public.changed_columns(o jsonb, n jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(k), '{}')
  from jsonb_object_keys(n) k
  where n -> k is distinct from o -> k;
$$;

-- ── bounties ────────────────────────────────────────────────────────────
drop policy if exists "Anyone can create bounties" on public.bounties;
drop policy if exists "Anyone can update bounties" on public.bounties;
drop policy if exists "Managers update their bounties" on public.bounties;
create policy "Managers update their bounties" on public.bounties
  for update to authenticated
  using (public.is_bounty_manager(id))
  with check (public.is_bounty_manager(id));

create or replace function public.bounties_guard()
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
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'payment_type', 'updated_at'])
    -- the counter moves only through increment_bids_accepted
    except select 'bids_accepted_count'
      where current_setting('app.increment_bids_accepted', true) = 'on'
  );
  if cardinality(bad) > 0 then
    raise exception 'Only the server can change bounty fields: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bounties_guard on public.bounties;
create trigger trg_bounties_guard
  before update on public.bounties
  for each row execute function public.bounties_guard();

-- increment_bids_accepted runs as definer from the manager's browser; it
-- lost its grant in the anon lockdown and now checks the caller itself.
create or replace function public.increment_bids_accepted(bounty_id_param uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_bounty_manager(bounty_id_param) then
    raise exception 'Only the bounty''s managers can accept bids' using errcode = '42501';
  end if;
  perform set_config('app.increment_bids_accepted', 'on', true);
  update public.bounties
  set bids_accepted_count = coalesce(bids_accepted_count, 0) + 1
  where id = bounty_id_param;
  perform set_config('app.increment_bids_accepted', 'off', true);
end;
$$;
revoke execute on function public.increment_bids_accepted(uuid) from public, anon;
grant execute on function public.increment_bids_accepted(uuid) to authenticated;

-- ── bids ────────────────────────────────────────────────────────────────
drop policy if exists "Anyone can create bids" on public.bids;
drop policy if exists "Anyone can update bids" on public.bids;
drop policy if exists "Bidders place their own bids" on public.bids;
drop policy if exists "Bidders and managers update bids" on public.bids;
create policy "Bidders place their own bids" on public.bids
  for insert to authenticated
  with check (public.is_my_wallet(bidder_address));
create policy "Bidders and managers update bids" on public.bids
  for update to authenticated
  using (public.is_my_wallet(bidder_address) or public.is_bounty_manager(bounty_id))
  with check (public.is_my_wallet(bidder_address) or public.is_bounty_manager(bounty_id));

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
drop trigger if exists trg_bids_guard on public.bids;
create trigger trg_bids_guard
  before insert or update on public.bids
  for each row execute function public.bids_guard();

-- ── milestones ──────────────────────────────────────────────────────────
drop policy if exists "Anyone can create milestones" on public.milestones;
drop policy if exists "Anyone can update milestones" on public.milestones;
drop policy if exists "Managers create milestones for approved bids" on public.milestones;
drop policy if exists "Managers update milestones" on public.milestones;
create policy "Managers create milestones for approved bids" on public.milestones
  for insert to authenticated
  with check (exists (
    select 1 from public.bids b
    where b.id = bid_id and b.status = 'approved' and public.is_bounty_manager(b.bounty_id)
  ));
create policy "Managers update milestones" on public.milestones
  for update to authenticated
  using (exists (select 1 from public.bids b where b.id = bid_id and public.is_bounty_manager(b.bounty_id)))
  with check (exists (select 1 from public.bids b where b.id = bid_id and public.is_bounty_manager(b.bounty_id)));

create or replace function public.milestones_guard()
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
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'completed_at', 'completed_by', 'review_comments'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Milestone amount, bid and description are fixed once created: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_milestones_guard on public.milestones;
create trigger trg_milestones_guard
  before update on public.milestones
  for each row execute function public.milestones_guard();

commit;
