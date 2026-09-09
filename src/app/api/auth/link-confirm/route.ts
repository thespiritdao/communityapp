// POST /api/auth/link-confirm
// Consume a one-time code on a new device. Links the new device's CDP
// wallet to the user account that issued the code, then returns a
// Supabase JWT so the new device can authenticate going forward.
//
// This endpoint does NOT require an existing Supabase session — the code
// is the credential for "which account". The caller must additionally
// prove control of `newWallet` with a CDP access token (src/lib/cdpAuth.ts)
// so a leaked code cannot be used to attach an attacker's wallet.
//
// See docs/spec-platform-identity-multi-wallet.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import {
  consumeLinkCode,
  getCanonicalWallet,
} from '@/services/userWalletsService';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { code?: string; newWallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const code = (body.code ?? '').toUpperCase().trim();
  const newWallet = (body.newWallet ?? '').toLowerCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json(
      { error: 'invalid code format' },
      { status: 400 },
    );
  }
  if (!/^0x[a-f0-9]{40}$/.test(newWallet)) {
    return NextResponse.json(
      { error: 'invalid wallet address' },
      { status: 400 },
    );
  }

  // Prove the caller's Coinbase session owns the wallet being linked.
  const verified = await verifyCdpWalletOwnership(req, newWallet, body as Record<string, unknown>);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const result = await consumeLinkCode({ code, newWallet });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const userId = result.userId;

  // Issue a Supabase JWT for the newly-linked device. The token still
  // carries the user's canonical wallet (for backwards compatibility
  // with code that reads jwt.wallet_address) — the new wallet's
  // recognition is via user_wallets, not via the JWT claim.
  const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
  if (!JWT_SECRET) {
    return NextResponse.json(
      { error: 'server configuration error' },
      { status: 500 },
    );
  }

  const canonicalWallet = (await getCanonicalWallet(userId)) ?? newWallet;

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7 days
    wallet_address: canonicalWallet,
    user_metadata: { wallet_address: canonicalWallet },
  };
  const supabaseToken = jwt.sign(jwtPayload, JWT_SECRET, {
    algorithm: 'HS256',
  });
  const refreshPayload = {
    ...jwtPayload,
    exp: now + 60 * 60 * 24 * 30,
    token_type: 'refresh',
  };
  const supabaseRefreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
    algorithm: 'HS256',
  });

  console.log(
    `✅ Link confirm: wallet ${newWallet} linked to user ${userId} (canonical=${canonicalWallet})`,
  );

  return NextResponse.json({
    supabaseToken,
    supabaseRefreshToken,
    userId,
    linkedWallet: result.wallet,
  });
}
