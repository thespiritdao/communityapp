# Spec: Platform Identity — Multi-Wallet

*Status: Draft / Not Yet Implemented*
*Created: 2026-05-24*
*Supersedes: `spec-vault-multi-wallet-identity.md` (which becomes one consumer of this layer)*

This spec defines a platform-wide identity layer that handles the
reality of CDP embedded wallets: **one authenticated user can have
many EVM addresses, one per device, by design.** The app has been
built on the assumption that user ↔ wallet is 1:1. That assumption is
wrong and has been since launch. This spec corrects it at the
identity layer rather than feature-by-feature.

## Background

### The CDP reality

Per Coinbase's own documentation and security research, embedded
wallets are scoped per device, not per user:

> "Embedded Wallets creates new addresses for security."
> — Coinbase docs

The CDP security model relies on a **device secret** stored in
browser local storage. Each device generates its own key material in
a TEE, and key material does not synchronize across devices. CDP
supports up to 5 devices per account, each with its own address.

Clearing browser storage on a device destroys that device's secret.
A subsequent sign-in generates a new wallet — not a recovery of the
old one.

### What this means for SpiritDAO

A user signed in across desktop, mobile, and incognito will appear as
three distinct EVM addresses to any code that reads
`currentUser.evmAccounts[0]`. All three addresses are valid CDP
accounts for the same authenticated user — but only one is registered
in our `user_profiles.wallet_address`.

Today, when a feature uses one of the unregistered wallets:

- On-chain actions are attributed to a wallet our DB doesn't know
- DB writes (`pod_members`, `forum_posts`, etc.) attribute to an
  unknown wallet
- Permission checks fail silently because the wallet doesn't appear
  in any role assignment
- Vault bootstrap (the only feature with server-side wallet matching)
  fails loudly with a 403

We've been lucky that mobile use was limited during the platform's
build-out. Mobile is the **intended core use case** for end users.
The current state is not ship-ready for that audience.

### Confirmed via empirical probe (2026-05-24)

A mobile session showed CDP wallet `0x35e1...` while the canonical
profile wallet is `0xcdf3...`. A diagnostic probe across 17
wallet-bearing tables confirmed that `0x35e1...` has zero writes
anywhere in the DB. This wallet exists only in the user's mobile
browser's CDP state and has been silently orphaned across every prior
mobile session.

## Design principles

1. **One user, many wallets.** Identity belongs to the `user_id`
   row, not to any specific EVM address. Wallets are facets the user
   exposes from different devices.
2. **Any linked wallet is equivalent for authorization.** Once a
   wallet is linked to a user, that wallet's signature satisfies any
   on-chain or signature requirement for that user.
3. **Linking requires explicit authorization from an already-linked
   device.** The first wallet is linked at signup. Each additional
   wallet requires a one-time code shown on an already-linked
   device, mirroring Signal/WhatsApp linking.
4. **Fail loud, not silent.** When an unlinked wallet attempts an
   action, the action is blocked with a clear "link this device"
   prompt. Silent corruption is not acceptable.
5. **Existing data is migrated, not abandoned.** Every existing
   `user_profiles.wallet_address` becomes that user's first linked
   (canonical) wallet.

## Data model

### `user_wallets` (new)

```sql
CREATE TABLE user_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL UNIQUE, -- always lowercase
  is_canonical    BOOLEAN NOT NULL DEFAULT false,
  nickname        TEXT, -- optional; user-supplied "iPhone", "Desktop Chrome", etc.
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_via_wallet TEXT, -- which wallet authorized this link (null for canonical)
  last_seen_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX user_wallets_one_canonical_per_user
  ON user_wallets(user_id) WHERE is_canonical = true;

CREATE INDEX user_wallets_user_id_idx ON user_wallets(user_id);
CREATE INDEX user_wallets_wallet_address_idx ON user_wallets(wallet_address);

COMMENT ON TABLE user_wallets IS
  'All EVM addresses linked to a user. Exactly one per user has is_canonical=true; the others are additional devices linked via the one-time-code linking flow.';
```

### `user_wallet_link_codes` (new)

Short-lived codes for the linking flow.

```sql
CREATE TABLE user_wallet_link_codes (
  code            TEXT PRIMARY KEY, -- 6 char alphanumeric
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by_wallet TEXT NOT NULL, -- the already-linked wallet that issued
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  consumed_by_wallet TEXT
);

CREATE INDEX user_wallet_link_codes_user_id_idx
  ON user_wallet_link_codes(user_id) WHERE consumed_at IS NULL;
```

### `user_profiles` migration

`user_profiles.wallet_address` stays for backwards compat but becomes
**the same value as that user's canonical row in `user_wallets`**.
After migration, code should prefer reading from `user_wallets`. We
can phase out `user_profiles.wallet_address` in a later cleanup.

### Migration (one-time)

```sql
-- Backfill: every existing user gets one canonical wallet
INSERT INTO user_wallets (user_id, wallet_address, is_canonical, linked_at)
SELECT user_id, LOWER(wallet_address), true, COALESCE(onboarded_at, NOW())
FROM user_profiles
WHERE wallet_address IS NOT NULL
ON CONFLICT (wallet_address) DO NOTHING;
```

## Authentication flow changes

Today, `POST /api/auth/onchainkit` does:

1. Receive `{ address, email, isEmbedded }` from CDP SDK
2. Look up `user_profiles` by email, then by wallet
3. Reuse or create user
4. JWT-sign with the profile's canonical wallet

New flow:

1. Receive same payload
2. Look up `user_wallets WHERE wallet_address = LOWER(address)`
3. **If found** → JWT for `user_wallets.user_id`. Done. (This is
   the case where the same physical wallet is reused — uncommon
   except for re-logins on the same device.)
4. **If not found** → look up `user_profiles` by email
   - If found by email → existing user with a new device. Don't
     auto-link. Return a special response: `{ requiresLinking: true,
     userId, message: "This is a new device — link to your existing
     account?" }`. Client renders the link flow.
   - If not found by email → genuinely new user. Existing signup
     flow: create `auth.users`, create `user_profiles`, create
     `user_wallets` (canonical), invite code, etc.

### Linking flow

On a known device (e.g. desktop):
1. User → Settings → Linked Devices → "Add a device"
2. Client POSTs to `/api/auth/link-code` (auth required)
3. Server generates a 6-char code (e.g. `K7M2P9`), inserts into
   `user_wallet_link_codes` with 10-min expiry, returns `{ code,
   expiresAt }`
4. UI displays the code

On the new device (e.g. mobile):
1. User signs in with Google → auth endpoint returns `requiresLinking: true`
2. UI shows: "It looks like this is a new device. Enter the code
   from your existing device."
3. User enters code
4. Client POSTs `/api/auth/link-confirm` with `{ code, newAddress }`
5. Server:
   - Validates code exists, not consumed, not expired
   - Inserts `user_wallets` row for `newAddress`, `is_canonical=false`
   - Marks code consumed
   - Returns full JWT (now the new device is linked)
6. Client stores JWT, proceeds normally

### First-device bootstrap

When a new user signs up:
1. Receive `{ address, email }`
2. No user found by email or wallet
3. Create everything as today
4. **Also insert `user_wallets` row with `is_canonical=true`**
5. Recommend (UI prompt): "Save your account info — you'll need it
   to link additional devices later."

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/onchainkit` | EXTENDED. New response shape includes `requiresLinking` |
| `POST` | `/api/auth/link-code` | NEW. Generate a link code (requires existing auth) |
| `POST` | `/api/auth/link-confirm` | NEW. Confirm linking with a code |
| `GET` | `/api/auth/linked-wallets` | NEW. List the user's linked wallets |
| `DELETE` | `/api/auth/linked-wallets/:wallet` | NEW. Revoke a linked wallet (cannot revoke canonical) |
| `PATCH` | `/api/auth/linked-wallets/:wallet/nickname` | NEW. Set nickname for a linked wallet |

## Server-side wallet checks

Today many server routes do:

```ts
const callerWallet = jwt.wallet_address.toLowerCase();
if (someResource.owner !== callerWallet) return 403;
```

These need to change to:

```ts
const userId = jwt.sub;
const userWallets = await getUserWallets(userId); // cached
if (!userWallets.includes(someResource.owner)) return 403;
```

A `getUserWallets(userId)` helper with sub-second caching is needed.
The cache invalidates on link/revoke.

### RLS implications

Today's pattern in many RLS policies:

```sql
auth.jwt() ->> 'wallet_address' = some_column
```

becomes:

```sql
some_column IN (
  SELECT wallet_address FROM user_wallets
  WHERE user_id = (auth.jwt() ->> 'sub')::UUID
)
```

This is a meaningful migration — every wallet-checking RLS policy
needs updating. We can phase: add the new check as an OR alongside
the old, then drop the old once all `user_profiles.wallet_address`
values are mirrored into `user_wallets`.

### JWT shape changes

The JWT should ideally embed the user's linked wallet list:

```json
{
  "sub": "<user_id>",
  "wallet_address": "0xcdf3...", // canonical, for backwards compat
  "user_metadata": {
    "wallet_address": "0xcdf3...",
    "linked_wallets": ["0xcdf3...", "0x35e1..."]
  }
}
```

`linked_wallets` lets some RLS policies avoid the subquery. But:
JWTs are signed at login time; if a wallet is linked mid-session,
the JWT won't reflect it until refresh. Two options:
1. Force refresh on link (UX hiccup)
2. RLS policies always check `user_wallets` table (slight DB cost,
   always-correct)

Recommended: option 2. Performance is fine if we index well.

## Action gating

Every feature that triggers an on-chain action (the 12 files identified
in audit) should:

1. Read `currentUser.evmAccounts[0]` (the device's current CDP wallet)
2. Compare against the user's linked wallets (cached client-side)
3. If unlinked → block the action; show "Link this device" prompt
4. If linked → proceed with that wallet's signature

A reusable hook:

```ts
function useActiveWalletStatus(): {
  cdpWallet: string | null;
  isLinked: boolean;
  isCanonical: boolean;
  promptLink: () => void;
}
```

Every on-chain trigger button (`<Button onClick={...}>` patterns)
gets wrapped to consult this hook before firing. Standard React HOC
or hook pattern.

## UI surfaces

### Settings → Linked Devices (new page)

```
Linked Devices

Your account is linked to N devices. You can use SpiritDAO from any
of them.

┌─────────────────────────────────────────────────────────────┐
│ 🖥  Desktop Chrome     0xcdf3...6f48     Canonical          │
│    Linked: Dec 19, 2025  Last seen: 2 min ago               │
├─────────────────────────────────────────────────────────────┤
│ 📱 iPhone Safari       0x35e1...13c7                        │
│    Linked: May 24, 2026  Last seen: 5 min ago     [Revoke]  │
└─────────────────────────────────────────────────────────────┘

[+ Add a new device]
```

### Link a new device (modal on existing device)

```
┌──────────────────────────────────────────────┐
│ Add a new device                             │
│                                              │
│ On your new device, sign in to SpiritDAO and │
│ enter this code:                             │
│                                              │
│        K 7 M 2 P 9                           │
│                                              │
│ This code expires in 9:53                    │
│                                              │
│ [Cancel]                                     │
└──────────────────────────────────────────────┘
```

### Link prompt (new device)

```
┌──────────────────────────────────────────────┐
│ This is a new device                         │
│                                              │
│ It looks like this is the first time you're  │
│ signing in from this device.                 │
│                                              │
│ ○ Link to my existing account                │
│   Enter the code from another signed-in      │
│   device.                                    │
│   [code input: ______]                       │
│   [Link this device]                         │
│                                              │
│ ○ This is a new account                      │
│   [Create new account]                       │
│                                              │
└──────────────────────────────────────────────┘
```

### Action-blocked toast

```
This device isn't linked to your account yet.
Link it before performing this action.   [Link now]
```

## Phased implementation

### Phase 1 — Foundation (3-4 days)

- `user_wallets` and `user_wallet_link_codes` tables + migration
- Auth endpoint extended with `requiresLinking` response
- Linking API routes (`/api/auth/link-code`, `/api/auth/link-confirm`)
- `getUserWallets(userId)` helper with cache
- Backfill: every existing `user_profiles.wallet_address` becomes a
  canonical row

### Phase 2 — Server-side propagation (2-3 days)

- Migrate all server routes that compare wallets to use the new helper
- Update RLS policies (OR with old pattern during transition)
- Vault routes updated to allow any linked wallet (not just canonical)

### Phase 3 — Client-side gating (2 days)

- `useActiveWalletStatus` hook
- Wrap each of the 12 on-chain-action files with the linking check
- Action-blocked toast component

### Phase 4 — UI (2 days) — ✅ DONE 2026-09-20

- Settings → Linked Devices — shipped as `LinkDeviceSection` on the Identity
  page (not a separate page): issues a code, copy button, live countdown,
  clears itself on expiry.
- Link prompt on the new device — `LinkNewDeviceModal`, shipped earlier; its
  instructions now point at Identity → Linked Devices.
- Until this landed the modal sent members to `/debug/whoami`, which was the
  only place a code could be issued. That page and the two `/api/debug/*`
  routes were deleted in the same change.

### Phase 5 — Cleanup (1 day)

- Remove `OR` legacy clauses from RLS once `user_wallets` is fully
  populated
- Drop `user_profiles.wallet_address` in a follow-up release
- Vault rebuild on top of new identity (separate effort)

**Total: 10-12 days**

## Vault integration

The existing `spec-vault-multi-wallet-identity.md` becomes one
consumer of this platform layer. The vault no longer needs its own
linking flow — it consumes the user's `user_wallets` list. The
seed-wrapping mechanic still applies (since CDP signatures still
vary per wallet), but the *which wallets* question is answered by
the platform.

The vault's bootstrap on a new device becomes:
1. Detect: current CDP wallet is in `user_wallets` (linking already
   happened at the platform layer).
2. Fetch the user's vault state (seed wrapped per known CDP wallet).
3. Look for a wrap matching the current CDP wallet.
4. If found → unwrap, derive vault keypair, proceed.
5. If not found → use any cross-device sync mechanism (the linking
   code already used at platform layer can also escort the vault
   seed). To be detailed in the updated vault spec post-platform.

The current vault spec should be updated to reflect this delegation
once the platform layer ships.

## Security considerations

### Threat: phished one-time code

Attacker tricks the user into reading a link code aloud (social
engineering). The attacker enters it on their device → their CDP
wallet becomes linked to the victim's account.

Mitigations:
- Codes are 6 chars (1.5B combos), but the linking window is short
- Issuing the code requires existing auth (attacker can't issue a
  code for someone else)
- "I just linked a new device" notification to all linked devices
  immediately on link (with revoke link)
- 10-min code expiry, single-use

### Threat: malicious browser extension reading device secret

Same as today's threat model — already a limitation of CDP embedded
wallets. Doesn't change with this design.

### Threat: stolen device with active session

Stolen device retains its linked-wallet status until revoked. User
should revoke from another device. We need:
- A "remote revoke" flow with no real-time requirement
- Auto-revoke after long inactivity (e.g. 90 days)

### Threat: device limit gaming

CDP supports up to 5 devices. We don't add our own cap initially —
match CDP's. If users hit the 5-device limit at the CDP layer, our
linking will fail; we surface that error rather than silently
breaking.

## Open questions

1. **What happens if a user has multiple CDP accounts under
   different emails?** Today, the auth endpoint falls back to wallet
   matching to dedupe. With this spec, a user signing in with email
   B but holding a CDP wallet that's already linked to email A's
   account → we should keep wallet A's mapping. This needs a
   conflict-resolution policy.
2. **Should linked wallets be displayed publicly anywhere?** A user's
   profile page could show "uses devices: iPhone, Desktop Chrome"
   but that's probably unwanted detail. Recommendation: hide.
3. **Linking from a brand-new device with no other access.** What if
   user only has one device, loses it, signs into a new device, and
   has no way to authorize the link? Need a fallback: probably
   email-based confirmation, with the trade-off that email account
   compromise → wallet linking. Document as the recovery flow.
4. **Auditability.** Every link/revoke should land in `explorer_events`
   (Pulse) so users see "you linked a new device on date X."

## Migration risk

This is invasive. RLS changes alone touch many policies. Phase the
rollout:

1. **Phase 1 ships shadow mode.** New columns + tables exist, code
   reads but doesn't enforce. Backfill happens. No user-facing
   change.
2. **Phase 2-3 ship behind a feature flag.** Wallet checks consult
   `user_wallets` when flag is on, fall back to `user_profiles` when
   off. Gradual rollout to test accounts, then exec pod, then
   general.
3. **Phase 4 surfaces the UI** once the backend is stable.
4. **Phase 5 (cleanup) is months later** when we've validated no
   regressions.

## File map (anticipated)

| Path | Role |
|---|---|
| `supabase/migrations/2026MMDD_user_wallets.sql` | Schema + backfill |
| `src/services/userWalletsService.ts` | Lookup/cache helper |
| `src/app/api/auth/onchainkit/route.ts` | Extended response |
| `src/app/api/auth/link-code/route.ts` | NEW |
| `src/app/api/auth/link-confirm/route.ts` | NEW |
| `src/app/api/auth/linked-wallets/route.ts` | NEW (list, revoke, rename) |
| `src/hooks/useActiveWalletStatus.ts` | NEW |
| `src/hooks/useLinkedWallets.ts` | NEW |
| `src/features/identity/components/LinkedDevicesPanel.tsx` | NEW |
| `src/features/identity/components/LinkDeviceModal.tsx` | NEW |
| `src/features/identity/components/NewDeviceLinkPrompt.tsx` | NEW |
| All 12 files using `currentUser.evmAccounts[0]` | Wrapped with gating |
| Numerous RLS policies | Updated per Phase 2 |

## Related docs

- [authentication-and-session-model.md](authentication-and-session-model.md) —
  current single-wallet auth flow
- [password-vault-architecture.md](password-vault-architecture.md) —
  the feature that surfaced this issue
- [spec-vault-multi-wallet-identity.md](spec-vault-multi-wallet-identity.md) —
  vault-specific spec that this platform spec supersedes; will be
  updated post-Phase 5 to delegate identity to this layer

## Final note

Mobile is the core use case. The platform's silent assumption of
1:1 user-to-wallet has been wrong since launch. This spec corrects
that at the foundation. Other features (vault, future linked-wallet
attribution, multi-device on-chain actions) become straightforward
consumers once this layer exists.

The vault's 403 was the canary. The actual problem is bigger and the
fix is in the foundation, not the feature.
