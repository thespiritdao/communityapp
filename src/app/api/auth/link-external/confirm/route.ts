// POST /api/auth/link-external/confirm
//
// Step 2 of linking an EXTERNAL wallet. The member signed the nonce message
// (from /nonce) with their external wallet. We recover the signer, verify it
// matches the claimed address, then link it (wallet_type='external').
//
// Requires authentication. Body: { address, signature, nonce }.
//
// See docs/spec-external-wallet-linking.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { isAddress, verifyMessage } from 'viem';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { insertLinkedWallet } from '@/services/userWalletsService';
import { buildLinkMessage } from '../nonce/route';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);

  let payload: any;
  try {
    payload = (await verifySessionTokenOrThrow(token));
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }
  const userId = payload?.sub as string | undefined;
  const jwtWallet = (
    payload?.wallet_address ?? payload?.user_metadata?.wallet_address
  )?.toLowerCase();
  if (!userId) {
    return NextResponse.json({ error: 'malformed token' }, { status: 401 });
  }

  let body: { address?: string; signature?: string; nonce?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  const { signature, nonce } = body;
  if (!address || !isAddress(address) || !signature || !nonce) {
    return NextResponse.json(
      { error: 'address, signature, and nonce are required' },
      { status: 400 },
    );
  }

  // Look up the nonce. Must exist, belong to this user + address, be unexpired
  // and unconsumed.
  const { data: nonceRow, error: nonceErr } = await supabaseAdmin
    .from('wallet_link_nonces')
    .select('nonce, user_id, address, expires_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle();

  if (nonceErr || !nonceRow) {
    return NextResponse.json({ error: 'nonce not found' }, { status: 400 });
  }
  if (nonceRow.user_id !== userId || nonceRow.address !== address) {
    return NextResponse.json({ error: 'nonce mismatch' }, { status: 400 });
  }
  if (nonceRow.consumed_at) {
    return NextResponse.json({ error: 'nonce already used' }, { status: 400 });
  }
  if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'nonce expired' }, { status: 400 });
  }

  // Rebuild the exact signed message and verify the signature came from the
  // claimed address. The nonce route put a millisecond ISO string
  // ("...T18:20:00.123Z") in the message; PostgREST returns the stored
  // timestamptz as "...T18:20:00.123000+00:00", so normalise it back or the
  // rebuilt message never matches and every valid signature is rejected.
  const expiresAtIso = new Date(nonceRow.expires_at).toISOString();
  const message = buildLinkMessage(address, nonce, expiresAtIso);
  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (e) {
    console.error('[link-external/confirm] verifyMessage error:', e);
  }
  if (!valid) {
    return NextResponse.json(
      { error: 'signature does not match the wallet address' },
      { status: 401 },
    );
  }

  // Signature proven. Link the wallet (blocks cross-user hijack internally).
  const linked = await insertLinkedWallet({
    userId,
    walletAddress: address,
    issuedByWallet: jwtWallet ?? address,
    walletType: 'external',
  });
  if (!linked) {
    return NextResponse.json(
      { error: 'could not link wallet (may already belong to another account)' },
      { status: 409 },
    );
  }

  // Consume the nonce (single use).
  await supabaseAdmin
    .from('wallet_link_nonces')
    .update({ consumed_at: new Date().toISOString() })
    .eq('nonce', nonce);

  return NextResponse.json({ ok: true, wallet: linked });
}
