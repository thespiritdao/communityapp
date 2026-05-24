# Spec: Vault Multi-Wallet Identity

*Status: SUPERSEDED 2026-05-24 by [spec-platform-identity-multi-wallet.md](spec-platform-identity-multi-wallet.md)*
*Created: 2026-05-24*

> **This spec is no longer the authoritative path forward.** After
> diagnosing the issue end-to-end, we confirmed the problem is not
> vault-specific — it's a platform-wide assumption (one user ↔ one
> EVM address) that CDP embedded wallets violate by design. The fix
> belongs at the platform identity layer, not inside the vault.
>
> See [spec-platform-identity-multi-wallet.md](spec-platform-identity-multi-wallet.md)
> for the active design. The vault becomes a consumer of that layer
> rather than implementing its own linking flow.
>
> The crypto mechanics below (seed wrapping, recovery codes, AAD
> binding) remain valid and will inform the vault's post-platform
> rebuild — but the linking infrastructure (one-time codes, device
> management) now lives at the platform level for all features to
> share.

This spec describes the long-horizon redesign of the password vault's
identity model. The current implementation (shipped 2026-05-22) binds
a user's vault identity to a single CDP wallet via a deterministic
signature. This breaks down when the same user accesses the app
through any auth method that produces a different `evmAccounts[0]` than
the one they originally bootstrapped with.

This document is the design we'll build to when we replace that.

## Problem statement

A SpiritDAO user has:

- One **`user_profiles` row** (`user_id`, `wallet_address`) — the
  canonical identity. Bound to their email/login at signup.
- Zero or more **CDP wallet variants** active at any time. CDP can
  expose different `evmAccounts` depending on auth method (email OTP
  vs Google OAuth vs external wallet) and session state.

The vault, as shipped, derives the encryption identity key from a
signature produced by `currentUser.evmAccounts[0]` over a canonical
message that includes that same address. The keypair is therefore
bound to one specific CDP wallet shape.

Consequences:

1. If the CDP wallet a user signs in with on device B doesn't match
   the one they bootstrapped with on device A, device B derives a
   different keypair → no wraps decrypt → vault is inaccessible on
   device B until the user signs out everywhere, signs back in via
   the original method, and reopens the vault.
2. Pubkey-publish requests fail with 403 when the JWT carries the
   canonical wallet but the request body sends the CDP wallet (they
   differ because CDP's session wallet ≠ profile's canonical wallet).
3. Users who change auth methods between devices have no recourse
   short of manager re-grants.

The 403 we hit on 2026-05-24 was the visible symptom; the deeper
issue is that identity is bound to a wallet variant rather than to
the user.

## Design principles

1. **Identity belongs to the user, not the wallet.** The vault should
   recognize the same user regardless of which CDP wallet variant
   they're holding this session.
2. **Server stores ciphertext only.** End-to-end encryption stays
   intact. The server never sees the seed or the unwrapped content
   keys.
3. **Any auth method the user has should work.** No "you must sign in
   with the same method you originally used."
4. **Lost devices are recoverable IF the user kept the recovery
   code.** Same trust model as 1Password / Proton — if you lose
   everything, the vault is gone; that's the price of E2EE.
5. **No backwards compatibility shim.** Bootstrapped users get
   transparently migrated; new users go through the new flow only.

## High-level mechanic

Three layers of indirection:

```
                            ┌─────────────────────────────────┐
                            │  Random 32-byte seed S          │
                            │  (the actual identity material) │
                            └─────────────┬───────────────────┘
                                          │ HKDF
                                          ▼
                            ┌─────────────────────────────────┐
                            │  X25519 keypair K (sk, pk)      │
                            │  Used exactly as today          │
                            └─────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────┐
  │  Server stores per user:                                   │
  │    pk (public) — same as today                             │
  │    wrapped_seeds: [                                        │
  │      { cdp_wallet: 0xAAA..., ciphertext: ... },            │
  │      { cdp_wallet: 0xBBB..., ciphertext: ... },            │
  │      ...                                                   │
  │    ]                                                       │
  │    recovery_wrap: { ciphertext: ..., salt: ... }           │
  │      // optional, encrypted under PBKDF2(recovery_code)    │
  └────────────────────────────────────────────────────────────┘
```

To use the vault on any device:
1. Look up the user's wrapped_seeds.
2. Ask CDP to sign the canonical message with the current CDP wallet.
3. Use that signature to derive a wrapping KEK (HKDF, same as today).
4. Try to decrypt each wrapped_seed with that KEK; the one matching
   the current CDP wallet decrypts.
5. Recover S → derive K → vault is open.

## Schema

### New columns / tables

```sql
ALTER TABLE vault_user_keys
  ADD COLUMN wrapped_seeds JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN recovery_wrap JSONB;

COMMENT ON COLUMN vault_user_keys.wrapped_seeds IS
  'Array of {cdp_wallet, ciphertext, iv, created_at} — the same 32-byte seed wrapped under different CDP wallet signatures. Allows one user to access the vault from any of their linked auth methods. Each ciphertext decrypts only with the matching CDP wallet''s signature over the canonical message.';

COMMENT ON COLUMN vault_user_keys.recovery_wrap IS
  '{ciphertext, iv, salt} — the seed wrapped under a PBKDF2 key derived from the user''s printed recovery code. Optional: users who decline to save a recovery code have NULL here and lose access if all CDP wallets become inaccessible.';
```

The existing `public_key` column stays. The new fields are additive.

### Why JSONB and not a separate table

Each user has typically ≤3 wrapped_seeds (one per active auth
method). Indexed access is by `user_id` anyway. JSONB keeps the schema
compact and reduces JOIN cost.

## Crypto

### Bootstrap (first device, first time)

```
1. Generate 32 random bytes → seed S
2. Derive identity keypair K via HKDF(S, "spiritdao-vault-x25519-v1")
3. Ask CDP to sign canonical message M
4. wrap_key = HKDF(signature, "spiritdao-vault-seed-wrap-v1")
5. wrapped = AES-GCM-encrypt(seed=S, key=wrap_key, aad=cdp_wallet)
6. POST { public_key: K.pub, wrapped_seeds: [{cdp_wallet, wrapped}] }
7. Optional: prompt user to save a recovery code now
   - recovery_code = 24 random words (BIP39 wordlist)
   - recovery_key = PBKDF2(recovery_code, random_salt)
   - recovery_wrap = AES-GCM-encrypt(seed=S, key=recovery_key)
   - POST { recovery_wrap: { ciphertext, iv, salt } }
   - Show user the recovery code ONCE; never store plaintext
```

### Unlock (any device, any session)

```
1. Fetch the user's vault_user_keys row
2. If no wrapped_seeds → first-time setup (above)
3. Ask CDP to sign canonical message M
4. wrap_key = HKDF(signature, "spiritdao-vault-seed-wrap-v1")
5. For each entry in wrapped_seeds:
   - Try AES-GCM-decrypt(entry.ciphertext, wrap_key, aad=entry.cdp_wallet)
   - If decryption succeeds:
     - seed = result
     - K = HKDF(seed, "spiritdao-vault-x25519-v1")
     - Done
6. If no entry decrypts:
   - The current CDP wallet has never been linked to this vault
   - Prompt: "Link this device" flow (below) OR "Recover with recovery code"
```

### Link a new auth method (user has working access via another device or auth method)

```
On the source device (working access):
1. User triggers "link new device" UI
2. Source device generates a one-time linking code (12 chars) +
   linking_pubkey
3. POST /api/vault/link-tokens { linking_code, linking_pubkey,
                                  expires_at: now + 10 min }

On the target device:
1. User enters the linking code from source
2. Target device generates its own ephemeral keypair (for ECDH with source)
3. Target asks CDP to sign canonical message → gets signature for current
   CDP wallet
4. POST /api/vault/link-request { linking_code, target_pubkey,
                                   target_cdp_wallet, signature }

Server:
1. Looks up the linking token (verifies code, not expired)
2. Notifies source device via realtime channel

Source device (back to it):
1. Receives target_pubkey + target_cdp_wallet
2. Performs ECDH(source_eph_sk, target_pubkey) → shared secret
3. Wraps the seed S under the shared secret
4. POST /api/vault/complete-link { linking_code, wrapped_for_target }

Target device:
1. Performs ECDH(target_eph_sk, source_pubkey) → same shared secret
2. Unwraps S
3. Now derives the same wrap_key as the source device WOULD have
   using the target's CDP signature
4. Wraps S again under the target's wrap_key
5. POST /api/vault/keys { append wrapped_seeds: [{ target_cdp_wallet,
                                                    new_wrapped }] }
6. Server appends to the user's wrapped_seeds; future opens on target
   device just use this directly
```

(This is the most complex part. It's modeled on Signal's "linked
device" flow. The one-time linking code is what proves both sides are
operated by the same human; the ephemeral ECDH ensures the server
never sees the seed.)

### Recovery (lost all devices, has recovery code)

```
1. User clicks "I lost access; recover with code"
2. Enters recovery code (24 words)
3. Browser: PBKDF2(code, recovery_wrap.salt) → recovery_key
4. AES-GCM-decrypt(recovery_wrap.ciphertext, recovery_key) → seed S
5. Browser asks CDP to sign canonical message (with current wallet)
6. Derive wrap_key from new signature; wrap S under it
7. POST to add the new entry to wrapped_seeds
8. Vault opens
```

## API surface (additions)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/vault/keys?eoa=...` | Existing; returns `public_key` only. **Unchanged.** |
| GET | `/api/vault/identity` | NEW. Returns the caller's full vault_user_keys row (wrapped_seeds, recovery_wrap presence flag). JWT-gated. |
| POST | `/api/vault/keys` | EXTENDED. Body now `{ publicKey, wrappedSeed?: { cdpWallet, ciphertext, iv } }`. Server appends wrappedSeed if provided. JWT wallet must match the canonical user; cdpWallet can differ. |
| POST | `/api/vault/recovery-wrap` | NEW. Store a recovery_wrap row. JWT-gated. |
| POST | `/api/vault/link-tokens` | NEW. Issue a linking code. |
| POST | `/api/vault/link-request` | NEW. Target device requests link with a code. |
| POST | `/api/vault/complete-link` | NEW. Source device completes the link. |
| DELETE | `/api/vault/keys/wrapped-seed` | NEW. Remove a wrapped_seed entry (e.g. user revokes an old auth method). |

The 403 in the current implementation goes away because the new POST
to `/api/vault/keys` no longer requires the request body's
`eoaAddress` to match the JWT wallet. The check becomes: "the JWT
matches a valid `user_profiles` row; that user owns this vault row."
The CDP wallet in the body is just metadata for which wrapped_seed to
append.

## UI changes

### Bootstrap prompt

Replace today's single-step "sign to derive key" with a two-step
flow on first setup:

```
Step 1: Sign-in proof
  "Sign this message to prove you control your wallet. No transaction,
   no gas."
  [Sign]

Step 2: Save your recovery code (RECOMMENDED)
  "Write this code down somewhere safe. It's the only way to recover
   your vault if you lose access to your account."
  [code shown with 24 words in a grid, copy button, "I've saved it"
   confirmation checkbox]
  [Continue]

  Or [Skip — I'll set up recovery later]
```

Existing users get a one-time "save your recovery code" prompt
post-migration. They can dismiss but it nags them periodically.

### Vault on new device

```
"Sign in to your vault"
  Standard sign-message prompt. If signature unwraps a wrapped_seed,
  vault opens. If not:

"This device isn't linked to your vault yet"
  Two options:
  - Link from an existing device:
      "On a device that can access your vault, go to Settings →
       Vault → Link new device. Enter the code:"
      [code input]
  - Recover with recovery code:
      "Enter your 24-word recovery code:"
      [textarea input]
```

### Settings

```
Vault → Linked devices
  Lists all wrapped_seeds with their cdp_wallet + last_used_at.
  Each row has a Revoke button (removes that wrapped_seed; future
  sessions on that auth method can't open the vault).
```

## Migration from current state

Users who bootstrapped under the old scheme have a public_key in
vault_user_keys but no wrapped_seeds. Two-phase migration:

### Phase 1 — Coexistence

The unlock hook tries the new scheme first (look up wrapped_seeds,
try to unwrap). If wrapped_seeds is empty BUT public_key exists,
fall back to the old scheme: derive key directly from signature; if
the derived pubkey matches the stored public_key, vault opens
(legacy path).

### Phase 2 — Opportunistic migration

The first time a legacy user opens the vault under the new code path:

```
1. Detect: wrapped_seeds is empty, but old-scheme unlock succeeded.
2. Browser: derive the old way; we now hold the keypair K.
3. Extract the seed-equivalent (we know the HKDF input was the
   signature; the new scheme expects a 32-byte random seed but the
   signature is also 65 bytes, so we'd need a one-time bridge:
   take the existing HKDF output as if it were the seed; new K is
   identical to old K).
4. Wrap that "seed" under the user's current CDP signature.
5. Append to wrapped_seeds.
6. Prompt user to save a recovery code.
7. Subsequent opens use the new flow.
```

(Note: the bridge in step 3 is the awkward part. Strictly correct
would be to generate a new random seed, derive a new keypair K', and
re-encrypt every existing entry to K'. We can do that if we accept
the migration cost. The simpler path is to special-case the legacy
seed as "the HKDF-output of the original signature" — slightly weird
but doesn't require touching any existing wraps.)

### Phase 3 — Remove the fallback

Once all active users have a wrapped_seed (we can measure via a DB
query), the legacy unlock path is removed. New schema is the only
schema.

## RLS / server enforcement

```sql
-- vault_user_keys policies (new)
CREATE POLICY "Users can read their own identity row"
ON vault_user_keys FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own identity row"
ON vault_user_keys FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

This requires linking `vault_user_keys` to `user_id` (currently keyed
only by `eoa_address`). Migration adds `user_id UUID NOT NULL
REFERENCES auth.users(id)`.

## Threat model deltas

| Threat | Today | After this spec |
|---|---|---|
| Lost device + lost recovery code | Vault lost | Vault lost (same) |
| Lost device, has recovery code | Inaccessible until manager re-grants | Recovery flow restores |
| User switches auth methods | Broken | Works (each method wraps the seed) |
| Compromised CDP wallet | Vault opens for attacker | Vault opens for attacker IF the attacker has that wallet's wrapped_seed wraps |
| Server DB breach | Encrypted blobs (safe) | Encrypted blobs + wrapped seeds (still safe — seeds wrapped under signatures the server doesn't have) |
| Recovery code phished | n/a | Attacker can unwrap seed → permanent vault compromise. Recovery code = "treat like a master password." Document this. |

Net: substantially better UX for legitimate users, threat model
roughly equivalent (the recovery code is a new attack surface but a
necessary one for usability).

## Open questions

1. **Linking code lifetime.** 10 minutes seems right but might be
   short if the user has to go grab the other device. Consider 30
   min with a Cancel button on the source side.
2. **Per-wallet linking limits.** Should we cap wrapped_seeds at,
   say, 5 entries to prevent abuse? Probably yes.
3. **Recovery code wordlist.** BIP39 is the obvious choice; 24 words =
   256 bits of entropy. We could go to 12 words (128 bits) if UX
   pressure demands it. Don't think we should.
4. **PBKDF2 iterations for recovery code.** 600K is OWASP 2023
   recommendation. We can go higher; mobile users might feel the
   delay. Start at 600K.
5. **What if the user's `user_profiles.wallet_address` itself
   changes?** It shouldn't, but if it does (e.g. account merge),
   we need an admin tool to repoint vault_user_keys.user_id.
6. **Recovery code presentation.** Do we render it as a QR for easy
   transcription? Tempting but adds attack surface (screenshot leaks).
   Plain text + copy button is conservative.

## Implementation phasing

### Phase A (~2 days)
- Add `wrapped_seeds`, `recovery_wrap`, `user_id` columns to
  `vault_user_keys`
- New `/api/vault/identity` and `/api/vault/recovery-wrap` routes
- Bootstrap UI updated to two-step
- New unlock hook supporting both legacy and new schemes

### Phase B (~3 days)
- Linking flow (`/api/vault/link-*` routes + UI on both sides)
- Recovery flow UI
- Settings → Linked Devices page

### Phase C (~1 day)
- Opportunistic migration of legacy users on next vault access
- Telemetry to count remaining legacy users
- Cleanup of legacy unlock path once count = 0

### Phase D (deferred)
- Cap wrapped_seeds per user (5)
- Audit log of link/revoke actions (already partially covered by
  vault_access_log)
- Admin tool for user_profiles.wallet_address changes

Total: ~6 days of focused work plus a planning + crypto review pass.

## Crypto review checklist

Before shipping Phase A, an outside reviewer (or a careful internal
re-read) should verify:

- [ ] AAD on wrap is sufficient to prevent cross-user wrap reuse
- [ ] HKDF info strings are distinct per use (`-seed-wrap-v1` vs
      original `-x25519-v1`)
- [ ] PBKDF2 iterations meet OWASP guidance at ship time
- [ ] Recovery code generation uses CSPRNG, not Math.random
- [ ] Linking code flow doesn't leak the seed to the server even
      momentarily (it shouldn't — server only sees ECDH pubkeys)
- [ ] Ephemeral linking keys are zeroed after use
- [ ] All decryption paths fail closed; no "try harder" loops that
      could enable timing oracles

## File map (anticipated)

| Path | Role |
|---|---|
| `supabase/migrations/2026MMDD_vault_multi_wallet.sql` | Schema |
| `src/features/passwords/crypto/vaultIdentity.ts` | Pure crypto, extended (wrap/unwrap seed, recovery key derivation) |
| `src/features/passwords/crypto/useVaultIdentity.ts` | Rewritten unlock + bootstrap flow |
| `src/features/passwords/components/VaultBootstrapPrompt.tsx` | Two-step UI |
| `src/features/passwords/components/VaultLinkDeviceModal.tsx` | NEW |
| `src/features/passwords/components/VaultRecoveryModal.tsx` | NEW |
| `src/features/passwords/components/VaultLinkedDevices.tsx` | NEW (in settings) |
| `src/app/api/vault/identity/route.ts` | NEW |
| `src/app/api/vault/keys/route.ts` | EXTENDED |
| `src/app/api/vault/recovery-wrap/route.ts` | NEW |
| `src/app/api/vault/link-tokens/route.ts` | NEW |
| `src/app/api/vault/link-request/route.ts` | NEW |
| `src/app/api/vault/complete-link/route.ts` | NEW |

## Related docs

- [password-vault-architecture.md](password-vault-architecture.md) —
  current implementation
- [authentication-and-session-model.md](authentication-and-session-model.md) —
  the canonical vs CDP wallet distinction that motivates this spec
- [role-permissions-design-philosophy.md](role-permissions-design-philosophy.md) —
  permission gating still applies; this spec only changes the identity layer
