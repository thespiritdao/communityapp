/**
 * API Route: Onboarding Status
 *
 * POST /api/onboarding/status   { walletAddress, email? }
 *
 * The landing page asks this before a Supabase session exists, to decide
 * between the returning-member fast path and the invite-code flow. It used
 * to read user_profiles straight from the browser, which stopped working
 * when anon lost its grants and profiles became own-row only.
 *
 * The caller must prove control of the wallet (CDP access token). An email
 * is only used for the lookup when Coinbase verified it for this caller, so
 * the route cannot be used to test whether an address belongs to a member.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import { findUserByWallet } from '@/services/userWalletsService';

export const runtime = 'nodejs';

type ProfileRow = {
  wallet_address: string;
  referral_key: string | null;
  onboarded_at: string | null;
};

const COLUMNS = 'wallet_address, referral_key, onboarded_at';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const walletAddress: string | undefined = body?.walletAddress;
  const email: string | undefined = body?.email;

  const verified = await verifyCdpWalletOwnership(request, walletAddress, body);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const wallet = walletAddress!.toLowerCase();
  let profile: ProfileRow | null = null;
  let matchedBy: 'wallet' | 'email' | null = null;

  // 1. Linked wallet (user_wallets) → that user's profile
  const walletMatch = await findUserByWallet(wallet);
  if (walletMatch) {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select(COLUMNS)
      .eq('user_id', walletMatch.userId)
      .maybeSingle();
    if (data) {
      profile = data;
      matchedBy = 'wallet';
    }
  }

  // 2. Legacy profile keyed by this wallet
  if (!profile) {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select(COLUMNS)
      .eq('wallet_address', wallet)
      .maybeSingle();
    if (data) {
      profile = data;
      matchedBy = 'wallet';
    }
  }

  // 3. Same member on a new device: verified email only
  const normalizedEmail = email?.trim().toLowerCase();
  if (!profile && normalizedEmail && verified.emails.includes(normalizedEmail)) {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select(COLUMNS)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (data) {
      profile = data;
      matchedBy = 'email';
    }
  }

  return NextResponse.json({
    hasProfile: !!profile,
    onboarded: !!profile?.onboarded_at,
    matchedBy,
    walletAddress: profile?.wallet_address ?? null,
    // The invite code is the caller's own; only returned on a wallet match.
    referralKey: matchedBy === 'wallet' ? profile?.referral_key ?? null : null,
  });
}
