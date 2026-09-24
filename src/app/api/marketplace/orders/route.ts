/**
 * POST /api/marketplace/orders
 *   { address, userOpHash, token: '$SELF' | '$SYSTEM', items: [{ productId, quantity }] }
 *
 * Creates the order rows for a checkout once the payment is proven on-chain
 * (src/lib/marketplacePayment.ts). Members can no longer insert orders
 * themselves (migration 20260924000005): an order used to be whatever the
 * browser wrote, and fulfillment managers ship from that list.
 *
 * Auth, both required:
 *   - Supabase session whose member owns `address` (canonical or linked);
 *   - CDP access token proving `address`; its account list covers the smart
 *     account that sent the payment.
 *
 * Prices, names and amounts come from the products table and the chain, not
 * the request. Idempotent per payment: a repeat call returns the same orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import { walletsForBalanceCheck } from '@/services/userWalletsService';
import { verifyMarketplacePurchase } from '@/lib/marketplacePayment';

export const runtime = 'nodejs';

type Item = { productId: string; quantity: number };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const address: string | undefined = body?.address?.toLowerCase();
  const userOpHash: string | undefined = body?.userOpHash;
  const token = body?.token === '$SYSTEM' ? '$SYSTEM' : body?.token === '$SELF' ? '$SELF' : null;
  const items: Item[] = Array.isArray(body?.items)
    ? body.items.map((i: any) => ({ productId: String(i?.productId ?? ''), quantity: Math.max(1, Math.floor(Number(i?.quantity) || 1)) }))
    : [];

  if (!address || !userOpHash || !token || items.length === 0 || items.some((i) => !i.productId)) {
    return NextResponse.json({ error: 'address, userOpHash, token and items are required' }, { status: 400 });
  }

  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  if (!(await walletsForBalanceCheck(walletOrDenied)).includes(address)) {
    return NextResponse.json({ error: 'That wallet is not linked to your account' }, { status: 403 });
  }
  const cdp = await verifyCdpWalletOwnership(request, address, body);
  if (!cdp.ok) return NextResponse.json({ error: cdp.error }, { status: cdp.status });

  const ids = items.map((i) => i.productId);
  const { data: products, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, title, price_self, price_system')
    .in('id', ids);
  if (productError || !products || products.length !== new Set(ids).size) {
    return NextResponse.json({ error: 'One or more products no longer exist' }, { status: 404 });
  }
  const byId = new Map(products.map((p) => [String(p.id), p]));

  const proof = await verifyMarketplacePurchase({
    userOpHash,
    buyerAccounts: cdp.accounts,
    token,
    lines: items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      priceSelf: Number(byId.get(i.productId)!.price_self) || 0,
      priceSystem: Number(byId.get(i.productId)!.price_system) || 0,
    })),
  });
  if (!proof.ok) return NextResponse.json({ error: proof.reason }, { status: 409 });

  // One payment, one set of orders.
  const { data: existing } = await supabaseAdmin
    .from('marketplace_orders')
    .select('*')
    .in('transaction_hash', [proof.transactionHash, userOpHash]);
  if (existing && existing.length > 0) return NextResponse.json({ orders: existing });

  const rows = items.map((i) => {
    const p = byId.get(i.productId)!;
    return {
      buyer_address: address,
      product_id: i.productId,
      product_name: p.name || p.title,
      quantity: i.quantity,
      price_paid_self: token === '$SELF' ? (Number(p.price_self) || 0) * i.quantity : 0,
      price_paid_system: token === '$SYSTEM' ? (Number(p.price_system) || 0) * i.quantity : 0,
      transaction_hash: proof.transactionHash,
      status: 'processing',
    };
  });
  const { data: orders, error } = await supabaseAdmin.from('marketplace_orders').insert(rows).select();
  if (error) {
    console.error('❌ marketplace/orders: insert failed', error);
    return NextResponse.json({ error: 'Could not record the order' }, { status: 500 });
  }
  return NextResponse.json({ orders });
}
