# Authentication & Session Model

*Last updated: 2026-05-23*

This doc explains how a user goes from "clicked Connect" to "RLS
policies see them as authenticated." It's the bridge between Coinbase
CDP wallet identity and Supabase RLS identity — the joint nobody
should hand-edit without reading this first.

## The two identities

Every authenticated user has two simultaneous identities:

1. **CDP wallet identity** — an EVM address managed by Coinbase
   Developer Platform. Embedded wallets (the default flow) mean the
   private key is held by Coinbase; external wallets (MetaMask,
   WalletConnect) mean the user holds it themselves.

2. **Supabase auth identity** — a row in `auth.users` plus
   `user_profiles`. Identified by a `user_id` (UUID) and a
   `wallet_address` claim embedded in the JWT.

The link between them is the wallet address. Every Supabase JWT this
app issues includes `wallet_address` as both a top-level claim and
inside `user_metadata`. RLS policies read it as
`auth.jwt() ->> 'wallet_address'`.

## The auth endpoint

`POST /api/auth/onchainkit` is the single entry point. The CDP-side
SDK calls it with `{ address, email?, isEmbedded }` after the user
completes the Coinbase flow.

```
Client (CDP SDK)              Server (/api/auth/onchainkit)
─────────────────────────────────────────────────────────────
1. User logs in with        2. Receive { address, email,
   Coinbase (OTP / OAuth);     isEmbedded } + header
   client attaches the CDP     x-cdp-access-token
   access token              2b. cdp.endUser.validateAccessToken
   (getAccessToken())           → user's EVM accounts must
                                include `address`, else 401/403
                             3. Look up user_profiles by email
                                first, fall back to wallet
                             4a. Existing → reuse user_id
                             4b. New → create auth user +
                                 profile + invite code +
                                 exec notification +
                                 Paragraph subscription
                             5. Sign Supabase JWT with
                                wallet_address claim
                             6. Return { supabaseToken,
                                supabaseRefreshToken, userId }
7. Store tokens, attach to
   every Supabase + API call
```

### How we prove the caller controls the embedded wallet (added 2026-09-08)

Coinbase verifies the person (email OTP / OAuth) and holds the key, but
that trust lives between Coinbase and the browser. It says nothing about
whether the browser calling *our* endpoint holds that Coinbase session.
Until 2026-09-08 the route accepted any `address` in the body and issued
a JWT for it, so anyone who knew a member's wallet could obtain their
session.

Now every route that acts on a claimed wallet requires the **CDP end-user
access token**:

- Client: `getAccessToken()` from `@coinbase/cdp-core`, attached as the
  `x-cdp-access-token` header by the helpers in
  `src/features/identity/lib/cdpSession.ts` (`requestSupabaseSession`,
  `cdpFetch`). Never call these routes with a bare `fetch`.
- Server: `verifyCdpWalletOwnership(req, address, body)` in
  `src/lib/cdpAuth.ts` calls `cdp.endUser.validateAccessToken` and checks
  the claimed address is one of the user's EVM accounts (EOA or smart
  account). Fails closed: missing token → 401, wrong wallet → 403, missing
  server credentials → 503.
- Routes guarded: `auth/onchainkit`, `auth/link-confirm` (the wallet being
  linked), `auth/backfill-email`, `onboarding/complete`,
  `onboarding/mint-poc`, `invite/validate`.
- Server credentials: `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (a CDP
  Secret API Key). Falls back to `CDP_API_KEY` +
  `EXECUTIVE_MINTING_PRIVATE_KEY`.

CDP access tokens expire after 15 minutes, so this is a check at the
moment of login/onboarding, not a replacement for the Supabase session.

For external wallets, signature verification happens in
`walletVerificationService.ts` and `auth/link-external/*` (nonce +
`verifyMessage`). The `isEmbedded` flag from CDP tells us which path to
expect.

### Why email lookup before wallet lookup

Multiple Supabase accounts can share the same CDP embedded wallet
address (family members on one device). Email is the reliable unique
identifier from Coinbase. If we matched on wallet first, we'd attach
the wrong identity when family members log in on the same device.

When the CDP SDK can't surface the email (Google OAuth redirect
flows), we fall back to a wallet-based placeholder
(`${wallet}@wallet.spiritdao`) and update later when email arrives.

## JWT shape

```json
{
  "sub": "<user_id UUID>",
  "aud": "authenticated",
  "role": "authenticated",
  "iat": 1719000000,
  "exp": 1719604800,
  "wallet_address": "0x...",
  "user_metadata": {
    "wallet_address": "0x..."
  }
}
```

- **Access token:** 7-day lifetime.
- **Refresh token:** 30-day lifetime, `token_type: 'refresh'` claim.
- **Signing:** HS256 with `SUPABASE_JWT_SECRET` (env var).

The wallet address is always **lowercased** in the JWT. RLS policies
that compare against it should always `LOWER()` the column side too.

## What RLS sees

When a request hits Supabase with the JWT, RLS policies can read:

```sql
auth.uid()                          -- user_id UUID
auth.jwt() ->> 'wallet_address'     -- 0x... lowercased
auth.jwt() -> 'user_metadata' ->> 'wallet_address'
auth.role()                         -- 'authenticated'
```

The canonical pattern for "is this caller a pod member with permission
X" is in `role-permissions-design-philosophy.md` and
`pods-architecture-overview.md`.

## Canonical vs CDP wallet

A subtle but important distinction:

- **CDP wallet address** = what the CDP SDK gives the client this
  session. Can vary across auth methods for the same user.
- **Canonical wallet address** = `user_profiles.wallet_address`. The
  wallet associated with the user's profile when they were first
  created. Used by RLS, conference tokens, treasury operations.

The auth endpoint embeds the **canonical** wallet in the JWT for
existing users (line 249 of `auth/onchainkit/route.ts`). New users'
canonical wallet is the CDP wallet at creation time.

Why this matters: a user might log in via Google OAuth on one device
(CDP wallet A) and email OTP on another (CDP wallet B). Both find the
same `user_profiles` row by email. Both get a JWT with the canonical
wallet — not their session's CDP wallet — so RLS sees consistent
identity.

## Which wallet hook to use (READ BEFORE writing client code)

CDP creates a **different wallet per device**. So `useEvmAddress()`
returns *this device's* wallet, which for any user on a second device
(mobile, incognito, cleared storage) is **not** the wallet that owns
their hats, pod memberships, profile, or DB rows. Reading it for an
identity question silently breaks on every non-canonical device. This
was the root cause behind the May 2026 identity audit
([spec-identity-comparison-audit](spec-identity-comparison-audit.md)).

Three hooks, three jobs — pick by intent, not habit:

| Hook | Returns | Use for |
|---|---|---|
| `useUserWallet()` | canonical identity wallet (from JWT) | **All identity reads/writes**: "is this me", permissions, memberships, DB filters, author/sender attribution. **Default choice.** |
| `useSigningWallet()` | this device's CDP wallet | **Only** when you need a signature: passing `evmAccount`/`account` to `signEvmMessage`, `sendUserOperation`, `walletClient.signMessage`. |
| `useEvmAddress()` (raw CDP) | this device's CDP wallet | Avoid in new code. Legitimate only inside signing files and the pre-session auth bootstrap (`app/page.tsx`). |

Rule of thumb: **if the address is compared to a DB row, used as a
filter/attribution key, or asks "is this the user" → `useUserWallet()`.
If it's handed to something that signs → `useSigningWallet()`.** When a
component does both (a "hybrid"), use both: `useUserWallet()` for the
identity parts, `useSigningWallet()` for the signature. Never reach for
`useEvmAddress()` to answer an identity question.

Server side, the equivalent is `getAuthContext(req)` /
`getUserWallets(userId)` in `walletAuthService.ts` (reads the JWT + the
`user_wallets` linked-wallet set). See
[spec-platform-identity-multi-wallet](spec-platform-identity-multi-wallet.md)
for the full model.

> A repo-wide lint ban on `useEvmAddress` was considered but deferred:
> ~145 files still import it (a mix of legitimate signing use and
> not-yet-audited callsites), so an automated rule today is all noise.
> Once the remaining callsites are classified, a Biome
> `noRestrictedImports` (error, with signing-dir overrides) can lock
> this in. Until then, this section is the guard.

## Side effects on first login

Creating a new user triggers a chain of side effects (lines 184-228
of `auth/onchainkit/route.ts`):

1. **Invite code assignment.** `inviteCodeService.assignInviteCodeToUser`.
2. **Exec Pod notification.** `PodMembershipNotificationService.notifyExecPodOfNewAccount`.
3. **Paragraph subscription.** Adds email to the newsletter list.

All three are wrapped in try/catch and logged as non-critical. None
should block authentication if they fail.

## Server-side auth checks

API routes that need to know the caller's wallet decode the JWT
themselves rather than going through supabase-js. The pattern:

```typescript
import jwt from 'jsonwebtoken';

function getCallerWallet(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as any;
    const w = payload?.wallet_address ?? payload?.user_metadata?.wallet_address;
    return typeof w === 'string' ? w.toLowerCase() : null;
  } catch {
    return null;
  }
}
```

This pattern is repeated in every server route that needs caller
identity. Always lowercase before comparing.

## Session bootstrapping (client)

The provider stack in `src/app/providers.tsx` handles:

1. CDP SDK init + wallet hooks
2. `useEvmAddress()` exposes the EOA
3. On first available address, POST to `/api/auth/onchainkit`
4. Store returned tokens in `supabaseClient`
5. Hat registry initializer fetches all known hat IDs
6. Wallet verification cache for external wallets

Subsequent navigation just reuses the cached tokens until the access
token expires; the refresh token covers 30 days of inactivity.

## What can go wrong

- **`SUPABASE_JWT_SECRET` not set** — every API route's auth check
  returns null silently. The user sees mysterious 401s.
- **Email collision** — two users with the same email but different
  wallets. The endpoint will reuse the first user's profile and
  silently bind to a different wallet than the user expects. Mitigation:
  current code lookups by email first (this IS the mitigation), but
  the underlying problem persists if a user manually edits emails.
- **Wallet placeholder leaks** — if the email never gets supplied,
  the user's profile permanently has `${wallet}@wallet.spiritdao` as
  email. Paragraph subscriptions and reset flows break. Fix when
  email finally surfaces by updating the profile row.
- **JWT secret rotation** — every active session is invalidated.
  Don't do this without a migration plan; refresh tokens use the same
  secret.

## File map

| Path | Role |
|---|---|
| `src/app/api/auth/onchainkit/route.ts` | The auth endpoint |
| `src/services/walletVerificationService.ts` | Signature verification for external wallets |
| `src/services/inviteCodeService.ts` | Invite code generation/assignment |
| `src/features/pods/services/PodMembershipNotificationService.ts` | Exec pod notification on new account |
| `src/utils/supabaseClient.ts` / `supabaseAdminClient.ts` | Client-side + admin-side clients |
| `src/app/providers.tsx` | Bootstraps auth + token storage |
