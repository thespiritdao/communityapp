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
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import { issueSupabaseSession } from '@/lib/issueSession';
import {
  consumeLinkCode,
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

  // Supabase issues the session for the newly linked device; the access-token
  // hook stamps the member's canonical wallet from user_wallets. The new
  // device wallet is recognised through user_wallets, not the token claim.
  const issued = await issueSupabaseSession(userId);
  console.log(`✅ Link confirm: wallet ${newWallet} linked to user ${userId} (Supabase-issued session)`);
  return NextResponse.json({
    supabaseToken: issued.accessToken,
    supabaseRefreshToken: issued.refreshToken,
    userId,
    linkedWallet: result.wallet,
  });
}
