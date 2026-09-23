-- Profiles become own-row only (app review Phase 4, step 2).
--
-- Before: "Authenticated users can read all profiles" USING (true), so any
-- signed-in member could read every member's email, phone, date of birth,
-- street address and ToS signature straight from the REST API. Members still
-- see each other through public_profiles (security_invoker=false, so it
-- reads past RLS and exposes only the public columns); the members page,
-- chat, forum and profile cards already read the view.
--
-- Also in this migration:
--   * generate_referral_key checks uniqueness across all profiles; under
--     own-row RLS an invoker-rights check would see only the caller's row.
--   * get_order_buyer_contact replaces the order page's direct read of the
--     buyer's address and phone.
--   * chat_messages "Allow inserts for wallet match" let any member post as
--     ANY member (sender only had to be some member's wallet). The own-wallet
--     policies next to it cover every legitimate insert.
--
-- Code shipped with this: /api/onboarding/status (landing-page lookup),
-- onboarding/complete + invite service on the service-role client,
-- proposalStates and sensemaker chat off the sessionless anon client.

begin;

drop policy if exists "Authenticated users can read all profiles" on public.user_profiles;
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

alter function public.generate_referral_key() security definer;
alter function public.generate_referral_key() set search_path = public;

create or replace function public.get_order_buyer_contact(p_order_id uuid)
returns table (
  first_name text,
  last_name text,
  address_1 text,
  address_2 text,
  city text,
  state text,
  zip text,
  phone text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select lower(up.wallet_address) as wallet
    from public.user_profiles up
    where up.user_id = auth.uid()
    limit 1
  ),
  o as (
    select mo.buyer_address, mo.fulfillment_manager_address, p.pod_id
    from public.marketplace_orders mo
    left join public.products p on p.id = mo.product_id
    where mo.id = p_order_id
  )
  select up.first_name::text, up.last_name::text,
         up.address_1::text, up.address_2::text,
         up.city::text, up.state::text, up.zip::text, up.phone::text
  from o
  cross join me
  join public.user_profiles up on lower(up.wallet_address) = lower(o.buyer_address)
  where me.wallet is not null
    and (
      me.wallet = lower(o.buyer_address)
      or me.wallet = lower(o.fulfillment_manager_address)
      or (o.pod_id is not null
          and public.has_pod_permission_current_user(o.pod_id::uuid, 'marketplaceManage'))
    )
  limit 1;
$$;

revoke execute on function public.get_order_buyer_contact(uuid) from public, anon;
grant execute on function public.get_order_buyer_contact(uuid) to authenticated;

drop policy if exists "Allow inserts for wallet match" on public.chat_messages;

commit;
