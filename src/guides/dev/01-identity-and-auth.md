# Identity & Authentication (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators.
>
> **Scope note:** This is public-safe documentation. It describes the auth
> architecture, the identity-resolution flow, and the device-linking protocol.
> It deliberately omits security-sensitive internals (row-level-security policy
> details, exact authorization-gate logic, secret values).

---

## What authenticates a user

There is **no password**. Authentication is a Coinbase **CDP embedded wallet**:
a user signs in with **email OTP** or **Google OAuth**, and CDP provisions a
device-scoped **ERC-4337 smart wallet** for them. That wallet address is the
user's on-chain identity.

A RainbowKit / external-wallet path still exists in the codebase but is
**legacy**: the canonical, supported path is the CDP embedded wallet.

Sessions are **not** CDP sessions. After the wallet exists, the app mints its
own **custom Supabase JWT** carrying a `wallet_address` claim. That claim is what
Postgres **Row-Level Security** uses to scope every read and write. The chain
proves who you are, and the JWT carries that proof into the database.

| Concern | Mechanism |
|---------|-----------|
| Sign-in | CDP embedded wallet (email OTP / Google OAuth) |
| On-chain identity | Device-scoped ERC-4337 smart wallet |
| Session | Custom Supabase JWT with `wallet_address` claim |
| DB authorization | Postgres RLS keyed on the JWT's `wallet_address` |
| Legacy path | RainbowKit / injected wallets (present, not canonical) |

---

## The multi-device problem

CDP mints **one wallet per device, by design**. The same human signing in on
desktop, on mobile, and in an incognito window gets **three different
addresses**. Left unsolved, that human would look like three separate members,
with three separate sets of hats, tokens, and history.

The fix is a **multi-wallet identity layer**: a user is a stable `user_id` that
may own **many** wallet addresses, exactly one of which is **canonical**.

### Tables

| Table | Columns (key ones) | Purpose |
|-------|--------------------|---------|
| `user_wallets` | `user_id`, `wallet_address` (unique), `is_canonical`, `linked_via_wallet`, `last_seen_at` | one row per known wallet; maps every device wallet back to a single user |
| `user_wallet_link_codes` | 6-char code, 10-minute expiry | short-lived credential used to link a new device to an existing user |

Service access to these tables goes through
`src/services/userWalletsService.ts`.

---

## Identity resolution

Sign-in calls **`POST /api/auth/onchainkit`**. The server resolves the incoming
wallet through a **4-step lookup**:

1. **Known wallet**: the address already exists in `user_wallets`. Issue the
   Supabase JWT and proceed.
2. **Email match**: the address is new, but the email belongs to an existing
   user. Return **`requiresLinking: true`** (do *not* silently create a second
   identity; this device must be linked).
3. **Legacy profile match**: the wallet matches an older `user_profiles` row.
   Backfill a canonical `user_wallets` row and proceed.
4. **New user**: none of the above. Create a fresh user with this wallet as
   canonical.

Steps 1, 3, and 4 end in a JWT. Step 2 hands the client off to the
device-linking flow below.

---

## Device-linking flow

When resolution returns `requiresLinking: true`, the new device proves it
belongs to the existing user with a **6-character code**, generated on a device
that is **already** linked:

```
New device                         Already-linked device
   │                                      │
   │ POST /api/auth/onchainkit            │
   │   → requiresLinking: true            │
   │                                      │ POST /api/auth/link-code  (authenticated)
   │                                      │   → returns a 6-char code (10-min expiry)
   │                                      │
   │  ── user types the code in ──────────┤
   │                                      │
   │ POST /api/auth/link-confirm          │
   │   (the code IS the credential)       │
   │   → new wallet linked in             │
   │     user_wallets, JWT issued         │
   ▼                                      ▼
```

- **`POST /api/auth/link-code`**: authenticated; runs on the already-linked
  device; mints a code into `user_wallet_link_codes`.
- **`POST /api/auth/link-confirm`**: the **code itself** is the credential; on
  success the new device's wallet is added to `user_wallets` (non-canonical) and
  a JWT is issued.

The user-facing surface for this is
`src/features/identity/components/LinkNewDeviceModal.tsx`.

---

## Email privacy

A member's email is **private**: it is used for that member's own sign-in (email
OTP) and notifications, and is **not** exposed to other members in the directory
or on profiles. Peer contact happens through **in-app Direct Messages** (the
Message button on a profile), never email.

Current state is enforced at the **query layer**: client- and peer-facing reads
select explicit public columns and omit email. A DB-level `public_profiles` view
is planned as the eventual boundary (see
`docs/spec-member-email-privacy.md`).

---

## Design rule: when to use the device wallet, not the canonical one

The canonical wallet is the right answer for **identity** reads ("who is this
member?"). It is the **wrong** answer for a couple of callsites that must operate
on the *actual signing device*:

- **`src/app/page.tsx`**: the auth bootstrap. It runs *before* identity is fully
  resolved and must use the device wallet.
- **`src/app/vote/page.tsx`**: on-chain `hasVoted` checks. The vote is cast by
  the device's smart wallet, so the eligibility/duplicate check must read that
  same device address.

When in doubt: identity questions → canonical wallet; "did *this signer* do X
on-chain" → device wallet.

---

## Key files

| File | Role |
|------|------|
| `src/app/page.tsx` | auth bootstrap (uses device wallet, see rule above) |
| `src/features/identity/hooks/useAuth.ts` | client auth state / hook |
| `src/app/api/auth/onchainkit/route.ts` | identity resolution (the 4-step lookup) |
| `src/app/api/auth/link-code/route.ts` | generate a device-link code (authenticated) |
| `src/app/api/auth/link-confirm/route.ts` | redeem a link code, attach wallet |
| `src/services/userWalletsService.ts` | data access for `user_wallets` |
| `src/features/identity/components/LinkNewDeviceModal.tsx` | link-a-device UI |
| `src/wallet/components/CDPEmbeddedProvider.tsx` | CDP embedded-wallet provider |

---

## Where to go next

- **`00-architecture-overview.md`**: the whole-app map and cross-cutting patterns
- **`02-onchain-and-contracts.md`**: how a resolved wallet acts on-chain (Hats, paymaster, the write triad)
- **`04-governance-and-pods.md`**: how hats attach roles to these identities
