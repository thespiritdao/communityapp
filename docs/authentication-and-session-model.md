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
   Coinbase (OTP / OAuth)      isEmbedded }
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

### Why we don't verify a signature for embedded wallets

For embedded wallets, the private key is held by Coinbase — the user
never sees it. Coinbase verified the user's identity (email OTP or
OAuth) before issuing the wallet. We trust that verification.

For external wallets, signature verification IS required and happens
in `walletVerificationService.ts` via a separate connector-specific
flow. The `isEmbedded` flag from CDP tells us which path to expect.

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
