# Password Vault — Architecture & Operational Guide

*Last updated: 2026-05-24*

## Recent changes (2026-05-24)

- **Login field** added as a first-class encrypted field alongside the
  password. Schema migration `20260524000002_add_vault_login.sql`.
  Decrypted login renders in plaintext (no show/hide toggle) with its
  own copy button.
- **Multi-wallet aware throughout.** The vault now consumes the
  platform identity layer (`user_wallets`) for both recipient
  resolution and wrap lookups. A user can bootstrap their vault on
  any device's CDP wallet, then access entries from any of their
  linked devices regardless of which CDP wallet that device exposes.
  This was a significant refactor; see "Multi-wallet integration"
  section below.
- **`AeadParams` browser-strictness fix:** SubtleCrypto in recent
  Chrome / Safari rejects `additionalData: undefined`. The encrypt /
  decrypt helpers now build the params object conditionally. Tests
  didn't catch this because Node's webcrypto is more permissive.

## What this is

A pod-scoped, end-to-end encrypted credential store built into the
commapp. Pods can store shared logins (service accounts, API keys,
admin credentials) without those secrets ever existing in plaintext on
the server. Membership is gated by Hat-based pod roles, and each
entry's audience is explicitly chosen by the leader who creates it.

## Trust model — what it protects, what it doesn't

| Threat | Protected? |
|---|---|
| Supabase DB backup theft | ✅ Encrypted blobs only |
| Read-only DB compromise | ✅ Encrypted blobs only |
| Full server-side compromise | ✅ Server never holds plaintext or wrap keys |
| SpiritDAO operator collusion with Supabase | ✅ Same reason — server has nothing useful |
| SpiritDAO operator collusion with Coinbase CDP | ⚠️ Residual — see below |
| Compromised member device (key cached, malware on laptop) | ❌ Standard limitation — same for every credential vault |
| Member who reads then leaves the pod | ❌ Cannot retroactively un-see; future updates protected via rotation |

The residual CDP risk: identity keys are derived from a deterministic
CDP wallet signature. If Coinbase were coerced into producing a
signature on behalf of a CDP wallet user, that signature could derive
the identity key. This is documented to users at vault-bootstrap time.

## Cryptographic primitives

| Layer | Algorithm | Purpose |
|---|---|---|
| Identity keypair | X25519 (from `@noble/curves/ed25519`) | Per-user public/secret key for content-key wrapping |
| Key derivation | HKDF-SHA-256 (`@noble/hashes`) | Signature → seed → keypair; ECDH-shared-secret → wrap KEK |
| Content encryption | AES-GCM-256 (Web Crypto API) | Encrypts the password + optional notes |
| Wallet signing | EIP-191 `personal_sign` via `useSignEvmMessage` from `@coinbase/cdp-hooks` | One-time bootstrap signature; deterministic by spec (RFC 6979) |

No custom crypto. Each library is widely audited and used by viem,
ethers, wagmi, and similar.

## Data model

### Tables (in Supabase, `public` schema)

```
vault_user_keys        eoa_address PK, public_key, algorithm, ...
                       (keyed on whichever EOA bootstrapped — usually
                       the per-device CDP wallet, not the canonical)
vault_entries          id PK, pod_id FK, label, tags[], allowed_role_ids UUID[],
                       password_ciphertext, password_iv,
                       login_ciphertext?, login_iv?,
                       notes_ciphertext?, notes_iv?,
                       sender_pubkey, created_by, updated_by, version
vault_wrapped_keys     id PK, entry_id FK, recipient_eoa,
                       sender_pubkey, wrapped_key
                       UNIQUE(entry_id, recipient_eoa)
                       (recipient_eoa is the EOA that holds the matching
                        vault_user_keys row — not necessarily the
                        canonical wallet)
vault_pending_grants   id PK, pod_id FK, entry_id FK, newcomer_eoa
vault_rotation_jobs    id PK, pod_id FK, evicted_eoa, status, ...
vault_access_log       id PK, pod_id, entry_id?, accessor_eoa, action,
                       occurred_at
```

Plus one column on `pod_modules`:

```
passwords_enabled BOOLEAN NOT NULL DEFAULT false
passwords_config  JSONB DEFAULT '{}'
```

### Permission flags

Two new flags on the existing `pod_role_permissions.permissions` JSONB:

- `passwordsAccess` — read entries you have a wrap for
- `passwordsManage` — create / update / delete entries; grant access
  to newcomers; trigger rotation

When a leader turns on the Passwords module, both flags auto-sync onto
existing pod roles: leader roles get both, member roles get
`passwordsAccess`. Turning the module off zeroes them out.

### Permission resolution pattern

```
EXISTS (
  SELECT 1
  FROM active_pod_members apm
  JOIN pod_role_permissions prp
    ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
  WHERE apm.pod_id = <target pod>
    AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
    AND apm.is_active = true
    AND (prp.permissions->>'<permName>')::boolean = true
)
```

This is the canonical join used everywhere in the app — there is no
`pod_role_assignments` table. The link from wallet to role is
`active_pod_members.hat_id` → `pod_role_permissions.token_address`.

## Encryption flows

### Identity bootstrap (once per user)

1. User signs a fixed canonical message with their CDP EOA:

   ```
   SpiritDAO Password Vault — derive identity key v1

   Wallet: {eoa_lowercase}

   Do not sign this message outside the SpiritDAO app.
   ```

2. Browser hashes the signature with HKDF-SHA-256
   (`info: "spiritdao-vault-x25519-v1"`) → 32-byte seed.
3. Seed → X25519 keypair.
4. Public key is POSTed to `vault_user_keys` (server gates on the
   caller's Supabase JWT matching the published address).
5. Private key is stashed in `sessionStorage` for the session. Cleared
   on tab close; recomputed by re-signing next session.

### Creating an entry

1. Leader opens the AddPasswordModal; checks which roles can see this
   entry.
2. Client fetches eligible recipients via
   `GET /api/pods/:id/passwords/recipients?roleIds=...`. Server returns
   recipients with `eoaAddress` / `publicKey` pointing at whichever
   linked wallet has a published vault pubkey (often the per-device
   CDP wallet, not the canonical — see Multi-wallet integration).
3. Client generates a random 32-byte AES-GCM content key.
4. Client encrypts `password`, optional `login`, and optional `notes`
   under the content key (fresh IV per blob; AAD intentionally omitted
   on entry content — AAD is reserved for wrap-side binding).
5. For each recipient with a published pubkey, client:
   - Performs X25519 ECDH(my_secret, recipient_pubkey) → shared secret
   - HKDF → wrapping KEK
   - AES-GCM-encrypts the content key under the KEK, with
     `senderPubkey || recipientPubkey` as AAD
6. Client POSTs `{label, tags, allowedRoleIds,
   passwordCiphertext, passwordIv,
   loginCiphertext, loginIv,
   notesCiphertext, notesIv,
   senderPubkey, wraps[]}` to the server.
7. Server inserts the entry + the wrap rows. Never sees the content
   key or plaintext.

### Reading an entry

1. Client fetches the entry's ciphertext + its own wrap row. Server
   looks up the wrap against the caller's **entire linked-wallet set**
   (not just the JWT's canonical), so a wrap published under a
   non-canonical CDP wallet is still found.
2. ECDH(my_secret, wrap_sender_pubkey) → KEK → unwrap content key.
3. Decrypt password, optional login, and optional notes locally.
4. Render in a hidden input with copy-to-clipboard. Best-effort
   clipboard clear after 30s.

### Adding a new member (deferred-grant flow)

1. New member joins, gains `passwordsAccess` via their role.
2. On their next vault visit, browser bootstraps identity if missing
   and publishes pubkey.
3. Server-side queries detect entries the new member is entitled to
   read (via `allowed_role_ids` overlap) but has no wrap for, and
   enqueues `vault_pending_grants` rows.
4. Existing managers see a banner: "N members waiting for access."
5. Manager clicks "Grant all" → their browser:
   - Looks up each newcomer's pubkey
   - For each entry: unwraps the content key with the manager's
     identity, re-wraps under (manager_pubkey, newcomer_pubkey),
     posts the new wraps
   - Server inserts wraps and clears matching pending grants.

The `sender_pubkey` lives on `vault_wrapped_keys` (per-wrap), not on
`vault_entries`, specifically to support this: a regrant rebinds the
ECDH counterparty without changing the entry's original creator.

### Removing a member (rotation flow)

1. Manager removes `passwordsAccess` from the member's role, or burns
   their pod-member hat.
2. Server enqueues a `vault_rotation_jobs` row for the evicted EOA.
3. Next time an active reader opens the vault, browser sees the
   pending rotation. On click:
   - Decrypt each entry with current key.
   - Generate fresh content key for each.
   - Re-encrypt password + notes under the new key.
   - Re-wrap to current eligible recipients (per entry's
     `allowed_role_ids`).
   - POST the rotation payload; server replaces the entry's
     ciphertext + replaces all wraps in one transaction; the evicted
     EOA's wraps are gone after this.
4. The evicted user retains anything they read before eviction — that
   is irrecoverable by design. All *future* updates are inaccessible.

## Per-entry audience selection

When a leader creates an entry they see a checkbox list of pod roles.
The leader role is auto-checked and locked (managers can't lock
themselves out of their own vault). The selected role IDs are stored
on `vault_entries.allowed_role_ids` as a `UUID[]`.

The crypto enforces this automatically — wraps are only created for
wallets holding one of the listed roles. RLS on `vault_entries`
additionally checks role overlap as defense in depth on top of the
wrap-presence gate.

Empty `allowed_role_ids` = "any wallet with `passwordsAccess`"
(backwards-compatible legacy behavior).

## Multi-wallet integration (added 2026-05-24)

The vault was originally built assuming one user has one wallet. The
platform shipped a multi-wallet identity layer
(`spec-platform-identity-multi-wallet.md`) because CDP creates a
different EVM wallet per device for the same user. The vault now has
to play with that reality.

### The mismatch

- **`vault_user_keys`** is keyed on the EOA that bootstrapped — which
  is usually whichever per-device CDP wallet was active when the user
  first signed the canonical message.
- **Pod membership** (`active_pod_members.wallet`) is keyed on the
  user's **canonical** wallet (the one in `user_profiles.wallet_address`).
- These are usually different addresses for the same user.

### Three places this matters

**1. Recipient resolution** (`/api/pods/:id/passwords/recipients`)

Lists who can receive a wrap for new entries. The route returns one
recipient per canonical member, but the `eoaAddress` / `publicKey`
fields point at whichever **linked wallet** actually has a vault
pubkey published. If the user bootstrapped under their mobile CDP
wallet, that's what we wrap to.

The wrap binds to the pubkey via AAD, not the EOA — so the recipient
can later decrypt on any device by re-deriving their X25519 keypair
from the bootstrapping signature.

**2. Wrap creation** (`POST /api/vault/keys`)

Uses `authorizeOwnedWallet` from `walletAuthService` — accepts any of
the caller's linked wallets, not just the JWT's canonical one. Lets
a mobile session publish a vault pubkey for the CDP wallet that's
actually doing the signing on that device.

**3. Wrap lookup** (`GET /api/pods/:id/passwords` and
`/api/pods/:id/passwords/:entryId`)

When fetching the caller's wraps for entry decryption, looks up
`vault_wrapped_keys.recipient_eoa IN (caller's linked wallets)`
instead of just the canonical. Without this, the caller would see
their own entries as "Pending grant" because the wrap was published
under their CDP wallet, not their canonical.

### Helper: getCallerLinkedWallets

Both vault routes that do wrap lookups have an inline
`getCallerLinkedWallets(canonical: string)` helper:

```typescript
async function getCallerLinkedWallets(canonical: string): Promise<string[]> {
  // Find the user_id who owns this canonical wallet
  const { data: ownerRow } = await supabaseAdmin
    .from('user_wallets')
    .select('user_id')
    .eq('wallet_address', canonical)
    .eq('is_canonical', true)
    .maybeSingle();
  if (!ownerRow?.user_id) return [canonical];

  // Return every wallet linked to that user_id
  const { data: linked } = await supabaseAdmin
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', ownerRow.user_id);
  // ... dedupe + always include canonical for safety
}
```

This is exactly the same pattern the platform's `walletAuthService`
uses for `authorizeOwnedWallet`. Future code that needs "any of the
caller's wallets" should use that helper rather than the inline copy.

### Why the wrap binding still works across devices

A wrap is `AES-GCM-encrypt(content_key, kek, aad=(sender_pubkey || recipient_pubkey))`.

The `recipient_pubkey` is the user's X25519 pubkey, which is
deterministic from `HKDF(EIP-191 signature over canonical message)`.
The signature is deterministic per (wallet, message). So:

- User signs canonical message on Mobile (CDP wallet A) → derives
  keypair `K`, publishes `K.pub` to `vault_user_keys[recipient_eoa=A]`
- Wraps get stored with `recipient_eoa = A` and AAD bound to `K.pub`
- User later signs canonical message on Desktop (CDP wallet B) →
  derives keypair `K'`, publishes `K'.pub` to
  `vault_user_keys[recipient_eoa=B]`
- Wraps for `recipient_eoa = A` are still bound to `K.pub`. Desktop's
  `K'` can't unwrap them.

The current design avoids this because we wrap to **whichever pubkey
the user has already published.** We don't re-bootstrap on Desktop;
we look up Mobile's pubkey via `getCallerLinkedWallets` → find the
existing `vault_user_keys` row → use that pubkey as the recipient.

This means: **the vault works as long as at least one of the user's
linked wallets has bootstrapped.** If they sign in on a third device
that has yet a different CDP wallet AND for some reason wants to
bootstrap fresh, they'd publish a NEW pubkey that has no existing
wraps. They'd need a manager re-grant. We don't auto-bootstrap on new
devices for this reason.

### What still needs work

- The bootstrap hook (`useVaultIdentity`) currently signs with the
  active CDP wallet on this device. If the user opens the vault on a
  brand-new device for the first time, they bootstrap fresh — which
  creates a new `vault_user_keys` row but doesn't auto-grant access to
  existing entries. The full fix is `spec-vault-multi-wallet-identity.md`
  (currently superseded but still relevant): a wrapped-seed model where
  the user has one X25519 identity, and that identity's seed is
  encrypted under each device's CDP signature. On a new device, you
  unwrap the seed using your signature and recover the same keypair.
- A small UX prompt: if the user opens the vault on a new device, we
  should ideally detect "you already have a vault identity on another
  device" and prompt them to either sign in on that device first or
  start a re-grant flow.

## RLS overview

Six tables, all with RLS enabled. Key policies:

- `vault_user_keys.SELECT` — any authenticated user (pubkeys are
  public material)
- `vault_user_keys.INSERT/UPDATE` — caller's JWT wallet must match
  `eoa_address`
- `vault_entries.SELECT` — caller has a wrap OR `passwordsManage` OR
  (`passwordsAccess` AND role overlap with `allowed_role_ids`)
- `vault_entries.INSERT/UPDATE/DELETE` — `passwordsManage` in this pod
- `vault_wrapped_keys.SELECT` — caller is the recipient OR has
  `passwordsManage`
- `vault_wrapped_keys.INSERT/DELETE` — `passwordsManage`
- `vault_pending_grants.SELECT` — caller is the pending newcomer OR
  has `passwordsManage`
- `vault_pending_grants.INSERT/DELETE` — `passwordsManage`
- `vault_rotation_jobs.SELECT/UPDATE` — `passwordsAccess` (any reader
  can run a rotation)
- `vault_rotation_jobs.INSERT` — `passwordsManage`
- `vault_access_log` — no client policies (admin client only)

## API surface

All endpoints below require a Supabase Bearer JWT. Server resolves
permissions via the canonical `active_pod_members + pod_role_permissions`
join and returns 403 if the caller doesn't hold the right flag.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/vault/keys?eoa=...` | Look up one or many user pubkeys (comma-sep) |
| `POST` | `/api/vault/keys` | Publish own pubkey (caller's JWT wallet must match `eoaAddress` in body) |
| `GET` | `/api/pods/:id/passwords` | List entries + caller's wrap per entry |
| `POST` | `/api/pods/:id/passwords` | Create entry (managers only) |
| `GET` | `/api/pods/:id/passwords/:entryId` | Fetch one entry + caller's wrap |
| `PUT` | `/api/pods/:id/passwords/:entryId` | Update entry (managers only); replaces all wraps |
| `DELETE` | `/api/pods/:id/passwords/:entryId` | Delete entry (cascades) |
| `GET` | `/api/pods/:id/passwords/recipients?roleIds=...` | List wallets eligible to receive a wrap, filtered by roles |
| `GET` | `/api/pods/:id/passwords/roles` | List pod roles with their passwordsAccess / passwordsManage flags |
| `GET` | `/api/pods/:id/passwords/grants` | List pending grants (managers see all; newcomers see their own) |
| `POST` | `/api/pods/:id/passwords/grants` | Submit a batch of fresh wraps for newcomers |
| `GET` | `/api/pods/:id/passwords/rotations` | List pending rotation jobs |
| `POST` | `/api/pods/:id/passwords/rotations` | Submit a completed rotation (new ciphertext + new wraps) |

## Module integration

The vault is an add-on module under `PodModulesManager` →
`ADDON_MODULES`. Enabling it:

1. Sets `pod_modules.passwords_enabled = true` for the pod.
2. Iterates the pod's `pod_role_permissions` rows and:
   - Sets `passwordsAccess = true` on every role
   - Sets `passwordsManage = true` only on roles with
     `role_type === 'leader'` (or whose name matches `/leader/i`)
3. Renders `<PasswordVaultPanel>` inside the module's expanded view.

Toggling the module off zeroes both flags. Existing vault data stays
intact in the DB but becomes unreadable through the UI (no one holds
`passwordsAccess` anymore). Re-enabling restores access if the same
wallets still hold the same roles.

## Client file layout

```
src/features/passwords/
  crypto/
    vaultCrypto.ts          pure crypto helpers, no React, no DB
    vaultCrypto.test.ts     18 unit tests (Vitest, Node webcrypto)
    useVaultIdentity.ts     bootstrap + sessionStorage cache hook
  services/
    vaultService.ts         SDK over the API routes
  components/
    PasswordVaultPanel.tsx  main panel; mounted by PodModulesManager
    AddPasswordModal.tsx    create/edit form + audience picker
    PasswordEntryCard.tsx   single-entry display + decrypt-on-click
    PendingGrantsBanner.tsx manager-facing "grant all" CTA
    VaultBootstrapPrompt.tsx one-time signing prompt
```

## What is and isn't logged

`vault_access_log` records: `pod_id`, `entry_id`, `accessor_eoa`,
`action` (`read | create | update | delete | grant | rotate`),
`occurred_at`. No labels, no payload, no IPs.

No client-facing UI reads this table. It exists for incident response
via the Supabase SQL editor only. RLS is enabled with zero policies
for the `authenticated` role — only the service-role admin client can
read or write.

## Operator runbook

### When a leader reports "I enabled the module but my members can't see anything"

- Check `pod_modules.passwords_enabled` is `true` for the pod.
- Check the affected wallet's role has
  `permissions->>'passwordsAccess' = 'true'`.
- Check `active_pod_members` shows the wallet as `is_active = true`
  for the pod.
- If they've never bootstrapped, they should see the
  `VaultBootstrapPrompt`. If they have, check
  `vault_user_keys.public_key` is set for their EOA.

### When a manager wants to revoke a single user without removing them from the pod

- Toggle the user's role permissions to set `passwordsAccess = false`
  for that role. Or move them to a different role that doesn't have
  the flag.
- A `vault_rotation_jobs` row is NOT auto-created today — rotation is
  triggered by the module-toggle path and by role-permission changes
  that flip `passwordsAccess` off. Specific revocations may require
  manual `INSERT` into `vault_rotation_jobs`.

### When ciphertext appears "corrupted"

It's not — the most likely cause is the recipient's identity key
changing. If a user signs the bootstrap message after their old
`vault_user_keys.public_key` was already used to wrap content for
them, the old wraps become unrecoverable. Recovery requires a manager
to re-grant.

This is why the bootstrap flow detects a server pubkey mismatch and
forces a re-bootstrap rather than silently proceeding.

## Known limitations / out-of-scope (v1)

- **No version history UI.** The `version` column is bumped on every
  update but old ciphertext is overwritten. Adding a
  `vault_entry_versions` table later is a clean additive change.
- **No password generator in the modal.** Users paste what they have.
- **No 2FA secret storage with TOTP codegen.**
- **No cross-pod sharing.** Each pod's vault is independent.
- **No search across decrypted content.** Labels and tags are
  searchable; the encrypted blobs are not (which is the point).
- **No browser-extension autofill.**
- **Clipboard auto-clear is best-effort.** Chrome honors it; some
  Safari versions don't.

## Migration files

- `supabase/migrations/20260523000001_add_password_vault.sql` —
  schema + indexes + `pod_modules.passwords_enabled`
- `supabase/migrations/20260523000002_vault_rls.sql` — RLS policies
- `supabase/migrations/20260524000002_add_vault_login.sql` —
  adds `login_ciphertext` + `login_iv` columns to `vault_entries`
  (nullable; legacy entries keep working)

All idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
DROP POLICY IF EXISTS before CREATE POLICY).

## Verification

### Crypto unit tests

`npx vitest run src/features/passwords/crypto/vaultCrypto.test.ts`

18 tests cover: canonical message format, derivation determinism,
AES-GCM round-trip, AAD binding, multi-recipient wrap, rotation
correctness.

### Integration smoke test (manual, two test accounts in a test pod)

1. Member A enables the Passwords module → both wallets' roles now
   have `passwordsAccess`, A's role also has `passwordsManage`.
2. Member A opens the vault → bootstrap prompt → sign → pubkey lands
   in `vault_user_keys`.
3. Member A creates "Test entry / hunter2" with the Pod Member role
   checked. Confirm `vault_entries` has the row and
   `vault_wrapped_keys` has one row for A.
4. Member B opens the vault → bootstraps → publishes pubkey. Pending
   grant row appears for A's entries.
5. Member A grants → `vault_wrapped_keys` has a row for B.
6. Member B reads → sees "hunter2".
7. Manager disables `passwordsAccess` on B's role → rotation job
   appears.
8. Member A runs the rotation → B's wrap row is gone.
9. Member B reloads → "Your role doesn't have access."

### RLS regression

- As anon, `SELECT * FROM vault_entries` → 0 rows.
- As a wallet not in the pod, same → 0 rows.
- As a wallet with `passwordsAccess` but no wrap for a specific entry
  → entry visible only if their role is in `allowed_role_ids` (or the
  array is empty), per the SELECT policy.
