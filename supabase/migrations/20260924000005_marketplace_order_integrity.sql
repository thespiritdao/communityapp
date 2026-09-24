-- Applied to production 2026-09-24.
-- Marketplace orders: the server creates them after checking the payment
-- on-chain; buyers see their own, sellers see and fulfil theirs.
--
-- Before (found 2026-09-24): marketplace_orders had an ALL policy with
-- `true` for every signed-in member, plus INSERT `true` for anyone. Any
-- member could read every order (with shipping details), insert a
-- "processing" order that was never paid (fulfillment managers ship from
-- that list and nobody compared transaction_hash with the chain), or
-- rewrite and delete anyone's orders. order_status_history was readable by
-- all and writable for any order.
--
-- After:
--   * Orders are inserted by POST /api/marketplace/orders (service role)
--     once src/lib/marketplacePayment.ts proves the payment. No member
--     INSERT or DELETE.
--   * can_fulfill_order(): the product's owner or creator wallet, the order's
--     fulfillment manager, or a marketplaceManage holder in the product's pod.
--   * SELECT: the buyer (any linked wallet) or a fulfiller.
--   * UPDATE: fulfillers only, and only status, tracking_number, notes,
--     updated_at and fulfillment_manager_address (set to their own wallet).
--   * order_status_history: written by fulfillers as themselves, read by
--     the buyer and fulfillers.

begin;

create or replace function public.can_fulfill_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_orders o
    left join public.products p on p.id = o.product_id
    where o.id = p_order_id
      and (
        (p.owner_id is not null and p.owner_id = auth.uid()::text)
        or public.is_my_wallet(p.creator_wallet)
        or public.is_my_wallet(o.fulfillment_manager_address)
        or (p.pod_id is not null and p.pod_id ~* '^[0-9a-f-]{36}$'
            and public.has_pod_permission_current_user(p.pod_id::uuid, 'marketplaceManage'))
      )
  );
$$;
revoke execute on function public.can_fulfill_order(uuid) from public, anon;
grant execute on function public.can_fulfill_order(uuid) to authenticated;

-- ── marketplace_orders ──────────────────────────────────────────────────
drop policy if exists "Allow order creation from transactions" on public.marketplace_orders;
drop policy if exists "Allow order updates" on public.marketplace_orders;
drop policy if exists "Users can view their own orders" on public.marketplace_orders;
drop policy if exists "marketplace_orders_all_access" on public.marketplace_orders;
drop policy if exists "Buyers and fulfillers read orders" on public.marketplace_orders;
drop policy if exists "Fulfillers update orders" on public.marketplace_orders;

create policy "Buyers and fulfillers read orders" on public.marketplace_orders
  for select to authenticated
  using (public.is_my_wallet(buyer_address) or public.can_fulfill_order(id));

create policy "Fulfillers update orders" on public.marketplace_orders
  for update to authenticated
  using (public.can_fulfill_order(id))
  with check (public.can_fulfill_order(id));

create or replace function public.marketplace_orders_guard()
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
    except select unnest(array['status', 'tracking_number', 'notes', 'updated_at',
                               'fulfillment_manager_address'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Order payment and item details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  if new.fulfillment_manager_address is distinct from old.fulfillment_manager_address
     and not public.is_my_wallet(new.fulfillment_manager_address) then
    raise exception 'You can only assign an order to yourself' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_marketplace_orders_guard on public.marketplace_orders;
create trigger trg_marketplace_orders_guard
  before update on public.marketplace_orders
  for each row execute function public.marketplace_orders_guard();

-- ── order_status_history ────────────────────────────────────────────────
drop policy if exists "Users insert own status history" on public.order_status_history;
drop policy if exists "allow_authenticated_select_status_history" on public.order_status_history;
drop policy if exists "Fulfillers record status history" on public.order_status_history;
drop policy if exists "Buyers and fulfillers read status history" on public.order_status_history;

create policy "Fulfillers record status history" on public.order_status_history
  for insert to authenticated
  with check (public.is_my_wallet(changed_by_address) and public.can_fulfill_order(order_id));

create policy "Buyers and fulfillers read status history" on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = order_id
      and (public.is_my_wallet(o.buyer_address) or public.can_fulfill_order(o.id))
  ));

commit;
