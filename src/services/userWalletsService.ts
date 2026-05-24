// Platform identity layer — multi-wallet helper.
//
// Server-side functions for managing user_wallets and the linking
// flow. Used by:
//   - /api/auth/onchainkit         (detect new device, issue JWT)
//   - /api/auth/link-code          (issue one-time code)
//   - /api/auth/link-confirm       (consume code, link wallet)
//   - /api/auth/linked-wallets     (list/revoke/rename)
//   - Any future server route that needs "is this wallet authorized
//     for this user" semantics.
//
// All writes go through supabaseAdmin (service role). RLS on the table
// is configured for client SELECT-only of own rows; clients never
// write directly.
//
// See docs/spec-platform-identity-multi-wallet.md.

import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export interface UserWallet {
  id: string;
  userId: string;
  walletAddress: string;
  isCanonical: boolean;
  nickname: string | null;
  linkedAt: string;
  linkedViaWallet: string | null;
  lastSeenAt: string | null;
}

// ── small in-memory cache (per server instance) ────────────────────
// Lookups are hot on every request. TTL is intentionally short so
// link/revoke operations propagate quickly without explicit invalidation.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: UserWallet[]; expiresAt: number }>();

function cacheKey(userId: string): string {
  return `uw:${userId}`;
}

function readCache(userId: string): UserWallet[] | null {
  const hit = cache.get(cacheKey(userId));
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(cacheKey(userId));
    return null;
  }
  return hit.value;
}

function writeCache(userId: string, value: UserWallet[]): void {
  cache.set(cacheKey(userId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function invalidate(userId: string): void {
  cache.delete(cacheKey(userId));
}

// ── row → object ───────────────────────────────────────────────────
function toUserWallet(row: any): UserWallet {
  return {
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    isCanonical: row.is_canonical === true,
    nickname: row.nickname ?? null,
    linkedAt: row.linked_at,
    linkedViaWallet: row.linked_via_wallet ?? null,
    lastSeenAt: row.last_seen_at ?? null,
  };
}

// ── core lookups ───────────────────────────────────────────────────

/**
 * All wallets linked to a user. Returns canonical first, then by
 * linked_at ascending.
 */
export async function getUserWallets(userId: string): Promise<UserWallet[]> {
  const cached = readCache(userId);
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .order('is_canonical', { ascending: false })
    .order('linked_at', { ascending: true });

  if (error) {
    console.error('[userWallets] getUserWallets failed', error);
    return [];
  }
  const list = (data ?? []).map(toUserWallet);
  writeCache(userId, list);
  return list;
}

/**
 * Returns true if `walletAddress` is one of the user's linked wallets.
 * Use for "did this user authorize this action" checks server-side.
 */
export async function isLinkedWallet(
  userId: string,
  walletAddress: string,
): Promise<boolean> {
  const target = walletAddress.toLowerCase();
  const wallets = await getUserWallets(userId);
  return wallets.some((w) => w.walletAddress === target);
}

/**
 * Find the user_id (if any) linked to a given wallet address. Used by
 * the auth endpoint to recognize a new device's CDP wallet that has
 * already been linked.
 */
export async function findUserByWallet(
  walletAddress: string,
): Promise<{ userId: string; isCanonical: boolean } | null> {
  const target = walletAddress.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from('user_wallets')
    .select('user_id, is_canonical')
    .eq('wallet_address', target)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, isCanonical: !!data.is_canonical };
}

/**
 * Find the canonical wallet for a user. Used when we need the
 * "primary" address for display or for backwards compatibility with
 * code that still expects user_profiles.wallet_address.
 */
export async function getCanonicalWallet(
  userId: string,
): Promise<string | null> {
  const wallets = await getUserWallets(userId);
  return wallets.find((w) => w.isCanonical)?.walletAddress ?? null;
}

// ── mutations ──────────────────────────────────────────────────────

/**
 * Insert the user's first (canonical) wallet. Called at signup.
 * Idempotent — if the address is already linked, returns the existing
 * row.
 */
export async function insertCanonicalWallet(
  userId: string,
  walletAddress: string,
): Promise<UserWallet | null> {
  const target = walletAddress.toLowerCase();

  // If this wallet already exists for this user, just return it.
  const existing = await findUserByWallet(target);
  if (existing && existing.userId === userId) {
    const wallets = await getUserWallets(userId);
    const match = wallets.find((w) => w.walletAddress === target);
    if (match) return match;
  }

  const { data, error } = await supabaseAdmin
    .from('user_wallets')
    .insert({
      user_id: userId,
      wallet_address: target,
      is_canonical: true,
      last_seen_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[userWallets] insertCanonicalWallet failed', error);
    return null;
  }

  invalidate(userId);
  return toUserWallet(data);
}

/**
 * Insert a non-canonical (linked) wallet. Called by /api/auth/link-confirm
 * after a code has been validated.
 */
export async function insertLinkedWallet(args: {
  userId: string;
  walletAddress: string;
  issuedByWallet: string;
  nickname?: string;
}): Promise<UserWallet | null> {
  const target = args.walletAddress.toLowerCase();

  // Block linking a wallet that's already linked to ANOTHER user.
  const existing = await findUserByWallet(target);
  if (existing && existing.userId !== args.userId) {
    console.warn(
      `[userWallets] insertLinkedWallet refused — wallet ${target} already linked to user ${existing.userId}`,
    );
    return null;
  }

  // If already linked to THIS user, just return it.
  if (existing && existing.userId === args.userId) {
    const wallets = await getUserWallets(args.userId);
    const match = wallets.find((w) => w.walletAddress === target);
    if (match) return match;
  }

  const { data, error } = await supabaseAdmin
    .from('user_wallets')
    .insert({
      user_id: args.userId,
      wallet_address: target,
      is_canonical: false,
      nickname: args.nickname ?? null,
      linked_via_wallet: args.issuedByWallet.toLowerCase(),
      last_seen_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[userWallets] insertLinkedWallet failed', error);
    return null;
  }

  invalidate(args.userId);
  return toUserWallet(data);
}

/**
 * Revoke a linked wallet. Refuses to revoke the canonical wallet —
 * users who want to change their canonical wallet need a separate
 * promote-then-revoke flow (not in Phase 1).
 */
export async function revokeWallet(
  userId: string,
  walletAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const target = walletAddress.toLowerCase();

  const wallets = await getUserWallets(userId);
  const match = wallets.find((w) => w.walletAddress === target);
  if (!match) {
    return { success: false, error: 'wallet not linked to this user' };
  }
  if (match.isCanonical) {
    return { success: false, error: 'cannot revoke canonical wallet' };
  }

  const { error } = await supabaseAdmin
    .from('user_wallets')
    .delete()
    .eq('user_id', userId)
    .eq('wallet_address', target)
    .eq('is_canonical', false);

  if (error) {
    console.error('[userWallets] revokeWallet failed', error);
    return { success: false, error: error.message };
  }

  invalidate(userId);
  return { success: true };
}

/**
 * Set/clear a nickname for one of the user's linked wallets.
 */
export async function setWalletNickname(
  userId: string,
  walletAddress: string,
  nickname: string | null,
): Promise<boolean> {
  const target = walletAddress.toLowerCase();
  const { error } = await supabaseAdmin
    .from('user_wallets')
    .update({ nickname })
    .eq('user_id', userId)
    .eq('wallet_address', target);
  if (error) {
    console.error('[userWallets] setWalletNickname failed', error);
    return false;
  }
  invalidate(userId);
  return true;
}

/**
 * Update last_seen_at for a wallet. Called by the auth endpoint on
 * each sign-in. Fire-and-forget; failure is non-fatal.
 */
export async function touchWalletSeen(
  userId: string,
  walletAddress: string,
): Promise<void> {
  const target = walletAddress.toLowerCase();
  try {
    await supabaseAdmin
      .from('user_wallets')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('wallet_address', target);
    invalidate(userId);
  } catch (e) {
    /* non-fatal */
  }
}

// ── link-code lifecycle ────────────────────────────────────────────

const LINK_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to reduce typo risk
const LINK_CODE_LENGTH = 6;
const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateLinkCode(): string {
  // Use crypto.getRandomValues for unbiased selection (Node 19+ + Edge).
  const bytes = new Uint8Array(LINK_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    out += LINK_CODE_CHARS[bytes[i] % LINK_CODE_CHARS.length];
  }
  return out;
}

/**
 * Issue a new one-time link code. The caller must already be
 * authenticated (this is enforced by the route, not here). The
 * issuing wallet is recorded for auditability.
 */
export async function issueLinkCode(args: {
  userId: string;
  issuingWallet: string;
}): Promise<{ code: string; expiresAt: string } | null> {
  // Generate a unique code (retry on the extremely-unlikely collision).
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateLinkCode();
    const { data: existing } = await supabaseAdmin
      .from('user_wallet_link_codes')
      .select('code')
      .eq('code', candidate)
      .is('consumed_at', null)
      .maybeSingle();
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    console.error('[userWallets] issueLinkCode failed to generate unique code');
    return null;
  }

  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();

  const { error } = await supabaseAdmin
    .from('user_wallet_link_codes')
    .insert({
      code,
      user_id: args.userId,
      issued_by_wallet: args.issuingWallet.toLowerCase(),
      expires_at: expiresAt,
    });

  if (error) {
    console.error('[userWallets] issueLinkCode insert failed', error);
    return null;
  }
  return { code, expiresAt };
}

/**
 * Consume a link code. If valid, links the new wallet and returns the
 * user_id the new device should authenticate as.
 */
export async function consumeLinkCode(args: {
  code: string;
  newWallet: string;
}): Promise<
  | { success: true; userId: string; wallet: UserWallet }
  | { success: false; error: string }
> {
  const code = args.code.toUpperCase().trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return { success: false, error: 'invalid code format' };
  }

  // Atomic claim: select for update, validate, mark consumed.
  // Supabase doesn't expose SELECT FOR UPDATE directly; we do
  // best-effort: read, validate, conditional-update.
  const { data: row, error: lookupError } = await supabaseAdmin
    .from('user_wallet_link_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (lookupError) {
    console.error('[userWallets] consumeLinkCode lookup failed', lookupError);
    return { success: false, error: 'lookup failed' };
  }
  if (!row) return { success: false, error: 'code not found' };
  if (row.consumed_at) return { success: false, error: 'code already used' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'code expired' };
  }

  // Mark consumed. Conditional WHERE consumed_at IS NULL serves as the
  // single-use guard against concurrent claims.
  const newWalletLc = args.newWallet.toLowerCase();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('user_wallet_link_codes')
    .update({
      consumed_at: new Date().toISOString(),
      consumed_by_wallet: newWalletLc,
    })
    .eq('code', code)
    .is('consumed_at', null)
    .select('*');

  if (claimError) {
    return { success: false, error: claimError.message };
  }
  if (!claimed || claimed.length === 0) {
    return { success: false, error: 'code already used' };
  }

  // Link the new wallet.
  const newWalletRow = await insertLinkedWallet({
    userId: row.user_id,
    walletAddress: newWalletLc,
    issuedByWallet: row.issued_by_wallet,
  });

  if (!newWalletRow) {
    return {
      success: false,
      error: 'failed to link wallet — may already be linked to another user',
    };
  }

  return { success: true, userId: row.user_id, wallet: newWalletRow };
}
