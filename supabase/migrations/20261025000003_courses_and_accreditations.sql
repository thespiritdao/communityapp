-- Courses and accreditations.
--
-- A knowledge-base category can be marked as a course. When a member has a
-- completed view for every item in a course category, an accreditation row
-- is issued to them automatically (trigger on knowledge_item_views, plus a
-- claim RPC the client calls as a safety net). Accreditations are the
-- member's record ("resume"): shown on the Identity page, usable as a bounty
-- credential gate (token_type = 'accreditation', contract_address = course
-- category uuid), and later as a requirement for roles and other gates.
--
-- Applied to production: 2026-10-25.

-- ── 1. Course fields on knowledge_categories ──────────────────────────────
alter table public.knowledge_categories
  add column if not exists is_course boolean not null default false,
  add column if not exists accreditation_name text,
  add column if not exists accreditation_description text,
  add column if not exists accreditation_image_url text;

-- ── 2. Accreditation records ──────────────────────────────────────────────
create table if not exists public.accreditations (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references public.pods(id) on delete cascade,
  course_category_id uuid references public.knowledge_categories(id) on delete set null,
  wallet_address text not null,
  name text not null,
  description text,
  image_url text,
  source text not null default 'course' check (source in ('course', 'manual')),
  issued_at timestamptz not null default now(),
  issued_by text,              -- null = issued automatically by course completion
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists accreditations_course_wallet_uniq
  on public.accreditations (course_category_id, lower(wallet_address))
  where course_category_id is not null;
create index if not exists accreditations_wallet_idx
  on public.accreditations (lower(wallet_address));
create index if not exists accreditations_pod_idx
  on public.accreditations (pod_id);

alter table public.accreditations enable row level security;

-- Any signed-in member can see accreditations: they are the public record of
-- what a member has earned, like roles. Writes go through the leaders'
-- policies or the definer functions below.
drop policy if exists "Members can read accreditations" on public.accreditations;
create policy "Members can read accreditations"
  on public.accreditations for select
  to authenticated
  using (true);

drop policy if exists "Pod leaders issue accreditations manually" on public.accreditations;
create policy "Pod leaders issue accreditations manually"
  on public.accreditations for insert
  to authenticated
  with check (source = 'manual' and public.is_pod_leader_current_user(pod_id));

drop policy if exists "Pod leaders revoke accreditations" on public.accreditations;
create policy "Pod leaders revoke accreditations"
  on public.accreditations for update
  to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));

revoke all on public.accreditations from anon;
grant select, insert, update on public.accreditations to authenticated;

-- ── 3. Issue on completion ────────────────────────────────────────────────
-- Course is complete for a wallet when the category is a course, has at
-- least one item, and every item has a completed view by that wallet.
create or replace function public.course_is_complete(p_category_id uuid, p_wallet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from knowledge_categories c where c.id = p_category_id and c.is_course)
     and exists (select 1 from knowledge_items i where i.category_id = p_category_id)
     and not exists (
       select 1
       from knowledge_items i
       where i.category_id = p_category_id
         and not exists (
           select 1 from knowledge_item_views v
           where v.item_id = i.id
             and lower(v.user_address) = lower(p_wallet)
             and v.completed = true
         )
     );
$$;

-- Issues the accreditation if the course is complete and none exists yet.
-- A revoked accreditation is not re-issued automatically.
create or replace function public.award_course_accreditation(p_category_id uuid, p_wallet text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  existing uuid;
  new_id uuid;
begin
  if p_wallet is null or p_wallet = '' then
    return null;
  end if;
  select id, pod_id, name, accreditation_name, accreditation_description, accreditation_image_url, is_course
    into c
  from knowledge_categories
  where id = p_category_id;
  if not found or not c.is_course or c.pod_id is null then
    return null;
  end if;
  if not public.course_is_complete(p_category_id, p_wallet) then
    return null;
  end if;
  select id into existing
  from accreditations
  where course_category_id = p_category_id and lower(wallet_address) = lower(p_wallet);
  if existing is not null then
    return existing;
  end if;
  insert into accreditations (pod_id, course_category_id, wallet_address, name, description, image_url, source)
  values (
    c.pod_id,
    c.id,
    lower(p_wallet),
    coalesce(nullif(trim(c.accreditation_name), ''), c.name),
    c.accreditation_description,
    c.accreditation_image_url,
    'course'
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.award_course_accreditation(uuid, text) from public, anon, authenticated;

-- Trigger: whenever a view becomes completed, try to award for that item's course.
create or replace function public.trg_award_on_item_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cat uuid;
begin
  if new.completed is not true then
    return new;
  end if;
  select category_id into cat from knowledge_items where id = new.item_id;
  if cat is not null then
    perform public.award_course_accreditation(cat, new.user_address);
  end if;
  return new;
end;
$$;
drop trigger if exists award_on_item_completion on public.knowledge_item_views;
create trigger award_on_item_completion
  after insert or update of completed on public.knowledge_item_views
  for each row execute function public.trg_award_on_item_completion();

-- Client safety net: the signed-in member asks for their own accreditation
-- (covers completions recorded before the category became a course).
create or replace function public.claim_course_accreditation(p_category_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
    ''
  ));
begin
  if v_wallet = '' then
    return null;
  end if;
  return public.award_course_accreditation(p_category_id, v_wallet);
end;
$$;
revoke execute on function public.claim_course_accreditation(uuid) from public, anon;
grant execute on function public.claim_course_accreditation(uuid) to authenticated;

-- ── 4. Bounty gate kind 'accreditation' ───────────────────────────────────
alter table public.bounty_token_gates
  drop constraint if exists bounty_token_gates_token_type_check;
alter table public.bounty_token_gates
  add constraint bounty_token_gates_token_type_check
  check (token_type in ('hat', 'erc20', 'erc721', 'pod', 'event', 'accreditation'));

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
          null;
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
          null;
        end;
      elsif g.token_type = 'accreditation' and g.contract_address is not null then
        begin
          if exists (
            select 1
            from public.accreditations a
            where a.course_category_id = g.contract_address::uuid
              and lower(a.wallet_address) = v_wallet
              and a.revoked_at is null
          ) then
            return true;
          end if;
        exception when others then
          null;
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
          has_unverifiable := true;
        end if;
      else
        has_unverifiable := true;
      end if;
    end loop;
    return has_unverifiable;
  end if;

  return true;
end;
$$;
revoke execute on function public.bounty_bid_allowed(uuid) from public, anon;
grant execute on function public.bounty_bid_allowed(uuid) to authenticated;
