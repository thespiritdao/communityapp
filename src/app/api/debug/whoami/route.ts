// Diagnostic endpoint for debugging wallet/identity mismatches.
//
// Returns three identities for the caller:
//   - jwtWallet: what the Supabase JWT carries (canonical, per
//     auth/onchainkit/route.ts)
//   - profileWallet: what user_profiles row stores
//   - profileEmail: the email on that row (helps identify cross-account
//     issues)
//
// The caller passes their CDP-side wallet via query param so we can
// echo it back alongside; the server doesn't see currentUser.evmAccounts
// directly.
//
// This is a debug route. Auth-gated to authenticated users only. Returns
// only the caller's own identities — never anyone else's.
//
// Removal plan: this route exists to support the vault multi-wallet
// identity rollout (see docs/spec-vault-multi-wallet-identity.md). Drop
// it once the new identity system is in place.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'unauthorized — pass Authorization: Bearer <jwt>' },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'server misconfigured (no JWT secret)' },
      { status: 500 },
    );
  }

  let payload: any;
  try {
    payload = jwt.verify(token, secret);
  } catch (e: any) {
    return NextResponse.json(
      { error: `invalid jwt: ${e?.message ?? 'unknown'}` },
      { status: 401 },
    );
  }

  const jwtWallet =
    payload?.wallet_address ??
    payload?.user_metadata?.wallet_address ??
    null;
  const userId = payload?.sub ?? null;

  // Look up the canonical profile row. Use SELECT * and pluck so a
  // missing/renamed column doesn't silently zero out the result.
  let profileWallet: string | null = null;
  let profileEmail: string | null = null;
  let profileCreatedAt: string | null = null;
  let profileLookupError: string | null = null;

  if (userId) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      profileLookupError = error.message;
    } else if (data) {
      profileWallet = (data as any).wallet_address ?? null;
      profileEmail = (data as any).email ?? null;
      profileCreatedAt =
        (data as any).created_at ??
        (data as any).onboarded_at ??
        (data as any).tos_signed_at ??
        null;
    }
  }

  // CDP-side wallet, supplied by the caller via query param (the server
  // has no direct view into the user's current CDP wallet)
  const url = new URL(req.url);
  const cdpWallet = url.searchParams.get('cdpWallet')?.toLowerCase() ?? null;

  // Compute mismatches for quick visual scanning
  const jwtLc = typeof jwtWallet === 'string' ? jwtWallet.toLowerCase() : null;
  const profileLc =
    typeof profileWallet === 'string' ? profileWallet.toLowerCase() : null;
  const mismatches = {
    jwtVsProfile: !!jwtLc && !!profileLc && jwtLc !== profileLc,
    jwtVsCdp: !!jwtLc && !!cdpWallet && jwtLc !== cdpWallet,
    profileVsCdp: !!profileLc && !!cdpWallet && profileLc !== cdpWallet,
  };

  // Look up the user's linked wallets — the post-Phase-1 source of
  // truth for "is this caller the same user as this address?"
  let linkedWallets: Array<{
    walletAddress: string;
    isCanonical: boolean;
    nickname: string | null;
    linkedAt: string;
  }> = [];
  let cdpWalletIsLinked = false;
  if (userId) {
    const { data, error: linkedError } = await supabaseAdmin
      .from('user_wallets')
      .select('wallet_address, is_canonical, nickname, linked_at')
      .eq('user_id', userId)
      .order('is_canonical', { ascending: false });
    if (!linkedError && data) {
      linkedWallets = data.map((w: any) => ({
        walletAddress: w.wallet_address,
        isCanonical: w.is_canonical === true,
        nickname: w.nickname ?? null,
        linkedAt: w.linked_at,
      }));
      if (cdpWallet) {
        cdpWalletIsLinked = linkedWallets.some(
          (w) => w.walletAddress === cdpWallet,
        );
      }
    }
  }

  // Look up the user's vault_user_keys row to show whether the JWT
  // wallet has already published a vault pubkey.
  let vaultHasPubkeyForJwtWallet = false;
  let vaultHasPubkeyForCdpWallet = false;
  if (jwtLc) {
    const { data } = await supabaseAdmin
      .from('vault_user_keys')
      .select('eoa_address')
      .eq('eoa_address', jwtLc)
      .maybeSingle();
    vaultHasPubkeyForJwtWallet = !!data;
  }
  if (cdpWallet && cdpWallet !== jwtLc) {
    const { data } = await supabaseAdmin
      .from('vault_user_keys')
      .select('eoa_address')
      .eq('eoa_address', cdpWallet)
      .maybeSingle();
    vaultHasPubkeyForCdpWallet = !!data;
  } else if (cdpWallet === jwtLc) {
    vaultHasPubkeyForCdpWallet = vaultHasPubkeyForJwtWallet;
  }

  // Optional ?probe=0x... — for an arbitrary address (e.g. the CDP
  // wallet showing on a device), check whether it appears anywhere in
  // tables that store wallet addresses. Lets us answer empirically:
  // "has this rogue CDP wallet ever written anything to our DB?"
  const probeAddress = (url.searchParams.get('probe') ?? '').toLowerCase();
  let probeResults: Array<{
    table: string;
    column: string;
    count: number;
    error?: string;
  }> | null = null;

  if (probeAddress && /^0x[a-f0-9]{40}$/.test(probeAddress)) {
    const tablesToProbe: Array<{ table: string; column: string }> = [
      { table: 'user_profiles', column: 'wallet_address' },
      { table: 'pod_members', column: 'wallet' },
      { table: 'pod_leads', column: 'wallet' }, // pod_leads stored on pods row, but try as table too
      { table: 'governance_user_votes', column: 'voter_address' },
      { table: 'governance_votes', column: 'voter_address' },
      { table: 'event_registrations', column: 'wallet_address' },
      { table: 'event_check_ins', column: 'wallet_address' },
      { table: 'pod_applications', column: 'applicant_wallet' },
      { table: 'pod_application_votes', column: 'voter_wallet' },
      { table: 'forum_posts', column: 'author_wallet' },
      { table: 'forum_threads', column: 'author_wallet' },
      { table: 'chat_messages', column: 'sender_wallet_id' },
      { table: 'bounty_bids', column: 'bidder_wallet' },
      { table: 'notifications', column: 'recipient_wallet' },
      { table: 'explorer_events', column: 'actor' },
      { table: 'vault_user_keys', column: 'eoa_address' },
      { table: 'vault_wrapped_keys', column: 'recipient_eoa' },
    ];
    probeResults = [];
    for (const { table, column } of tablesToProbe) {
      try {
        const { count, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq(column, probeAddress);
        if (error) {
          probeResults.push({ table, column, count: 0, error: error.message });
        } else {
          probeResults.push({ table, column, count: count ?? 0 });
        }
      } catch (e: any) {
        probeResults.push({
          table,
          column,
          count: 0,
          error: e?.message ?? 'unknown',
        });
      }
    }
  }

  return NextResponse.json({
    userId,
    jwtWallet: jwtLc,
    profileWallet: profileLc,
    profileEmail,
    profileCreatedAt,
    profileLookupError,
    cdpWallet,
    mismatches,
    linkedWallets,
    cdpWalletIsLinked,
    vault: {
      hasPubkeyForJwtWallet: vaultHasPubkeyForJwtWallet,
      hasPubkeyForCdpWallet: vaultHasPubkeyForCdpWallet,
    },
    probeAddress: probeAddress || null,
    probeResults,
    diagnosis: diagnose(jwtLc, profileLc, cdpWallet, mismatches, cdpWalletIsLinked, linkedWallets.length),
  });
}

function diagnose(
  jwtWallet: string | null,
  profileWallet: string | null,
  cdpWallet: string | null,
  mismatches: { jwtVsProfile: boolean; jwtVsCdp: boolean; profileVsCdp: boolean },
  cdpWalletIsLinked: boolean,
  linkedWalletsCount: number,
): string {
  if (!jwtWallet) {
    return 'JWT has no wallet_address claim — auth token may be malformed.';
  }
  if (!profileWallet) {
    return 'No user_profiles row found for this user_id.';
  }
  if (!cdpWallet) {
    return 'No cdpWallet supplied as query param — open this URL with ?cdpWallet=0x... from the device to compare.';
  }
  if (mismatches.jwtVsProfile) {
    return 'JWT wallet differs from profile wallet — auth/onchainkit returned a non-canonical wallet in the JWT. This is a server-side bug.';
  }
  if (cdpWalletIsLinked) {
    return `Healthy. The CDP wallet on this device is linked to your account (you have ${linkedWalletsCount} linked wallet${linkedWalletsCount === 1 ? '' : 's'}). JWT carries the canonical wallet for backwards compat — that ≠ CDP-on-this-device is expected and not a bug post-Phase-1.`;
  }
  if (mismatches.jwtVsCdp) {
    return `CDP wallet (${cdpWallet}) is NOT in your user_wallets. The link either hasn't happened or didn't persist. Issue a code on a linked device and confirm it here. You currently have ${linkedWalletsCount} linked wallet${linkedWalletsCount === 1 ? '' : 's'}.`;
  }
  return 'All identities match. No mismatch detected.';
}
