// POST /api/auth/link-external/nonce
//
// Step 1 of linking an EXTERNAL wallet (e.g. MetaMask). Issues a one-time nonce
// and the exact message the external wallet must sign to prove ownership. The
// member then signs it with their external wallet and calls /confirm.
//
// Requires authentication (JWT identifies the user). The external address to be
// linked is provided in the body.
//
// See docs/spec-external-wallet-linking.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { isAddress } from 'viem';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { findUserByWallet } from '@/services/userWalletsService';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** The exact message format the external wallet signs. Kept in sync with
 *  /confirm. Lowercased address for consistency with the user_wallets invariant. */
export function buildLinkMessage(
  address: string,
  nonce: string,
  expiresAt: string,
): string {
  return [
    'SpiritDAO wallet link',
    '',
    `Sign this message to prove you own this wallet and link it to your`,
    `SpiritDAO account. This does not authorize any transaction, transfer, or`,
    `spend. SpiritDAO only reads token balances.`,
    '',
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'server configuration error' },
      { status: 500 },
    );
  }

  let payload: any;
  try {
    payload = (await verifySessionTokenOrThrow(token));
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const userId = payload?.sub as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'malformed token' }, { status: 401 });
  }

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: 'valid address required' },
      { status: 400 },
    );
  }

  // Don't allow linking a wallet already linked to a DIFFERENT user.
  const existing = await findUserByWallet(address);
  if (existing && existing.userId !== userId) {
    return NextResponse.json(
      { error: 'This wallet is already linked to another account.' },
      { status: 409 },
    );
  }

  // Random single-use nonce.
  const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const expiresAtIso = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from('wallet_link_nonces').insert({
    nonce,
    user_id: userId,
    address,
    expires_at: expiresAtIso,
  });
  if (error) {
    console.error('[link-external/nonce] insert failed:', error);
    return NextResponse.json({ error: 'could not issue nonce' }, { status: 500 });
  }

  const message = buildLinkMessage(address, nonce, expiresAtIso);
  return NextResponse.json({ nonce, message, expiresAt: expiresAtIso });
}
