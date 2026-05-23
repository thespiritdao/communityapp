-- Pod Password Vault — end-to-end encrypted credential storage.
--
-- Six new tables + one column on pod_modules. Server stores only
-- ciphertext and wrapped keys — it never sees plaintext password
-- values. Each authorized member of a pod gets one row in
-- vault_wrapped_keys per password, encrypted to their X25519 pubkey.
-- That pubkey is bootstrapped client-side from a deterministic
-- CDP wallet signature.
--
-- Membership is hat-gated via the new passwordsAccess / passwordsManage
-- role permissions, auto-granted when a pod enables this module.

-- ── identity keys (one row per user who's bootstrapped) ────────────────
CREATE TABLE IF NOT EXISTS vault_user_keys (
  eoa_address   TEXT PRIMARY KEY,
  public_key    TEXT NOT NULL,
  algorithm     TEXT NOT NULL DEFAULT 'x25519-v1',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vault_user_keys IS
  'X25519 public keys derived from CDP wallet signatures. One row per user. Pubkey is global (not per-pod) — same user uses the same identity across all their pods.';

-- ── password entries (one row per stored credential) ──────────────────
CREATE TABLE IF NOT EXISTS vault_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id               UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  label                TEXT NOT NULL,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  notes_ciphertext     TEXT,
  notes_iv             TEXT,
  password_ciphertext  TEXT NOT NULL,
  password_iv          TEXT NOT NULL,
  sender_pubkey        TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           TEXT NOT NULL,
  version              INTEGER NOT NULL DEFAULT 1
);
-- Per-entry audience selection. Empty array = "all members with
-- passwordsAccess" (backwards-compatible default). Non-empty array =
-- only wallets holding one of these pod_role_permissions rows get
-- wrapped keys and can read the entry.
ALTER TABLE vault_entries
  ADD COLUMN IF NOT EXISTS allowed_role_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS vault_entries_pod_id_idx ON vault_entries(pod_id);
CREATE INDEX IF NOT EXISTS vault_entries_allowed_role_ids_idx
  ON vault_entries USING GIN (allowed_role_ids);
COMMENT ON TABLE vault_entries IS
  'Encrypted password entries. label and tags are plaintext (indexable). password_ciphertext and notes_ciphertext are AES-GCM(content_key); content_key itself is stored only in vault_wrapped_keys, wrapped to each recipient.';
COMMENT ON COLUMN vault_entries.allowed_role_ids IS
  'pod_role_permissions IDs whose holders can read this entry. Empty array = anyone with passwordsAccess in the pod (legacy/default). Non-empty = audience is restricted to listed roles; wallets without one of these roles do not receive a wrapped key.';

-- ── wrapped content keys (one row per password × recipient) ───────────
-- sender_pubkey is per-wrap because rewraps (newcomer grants) are bound
-- to whichever member did the rewrap, not the original entry creator.
-- Recipients use this column to know which pubkey to ECDH against on
-- unwrap.
CREATE TABLE IF NOT EXISTS vault_wrapped_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
  recipient_eoa   TEXT NOT NULL,
  sender_pubkey   TEXT NOT NULL,
  wrapped_key     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, recipient_eoa)
);
CREATE INDEX IF NOT EXISTS vault_wrapped_keys_recipient_idx ON vault_wrapped_keys(recipient_eoa);
CREATE INDEX IF NOT EXISTS vault_wrapped_keys_entry_idx ON vault_wrapped_keys(entry_id);
COMMENT ON TABLE vault_wrapped_keys IS
  'Per-recipient encrypted content keys. wrapped_key is base64url(IV || ciphertext || tag) of the entry content key, encrypted under a KEK derived from X25519(sender_secret, recipient_pubkey). sender_pubkey identifies whose secret was used on the wrap side — this varies per row when a regrant rewraps from a different member than the original creator.';

-- ── pending grants queue (newcomer waiting for rewrap) ────────────────
CREATE TABLE IF NOT EXISTS vault_pending_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  entry_id        UUID NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
  newcomer_eoa    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, newcomer_eoa)
);
CREATE INDEX IF NOT EXISTS vault_pending_grants_pod_idx ON vault_pending_grants(pod_id);
COMMENT ON TABLE vault_pending_grants IS
  'Newcomers awaiting access to existing vault entries. Cleared when an existing reader rewraps content keys to them.';

-- ── rotation jobs queue (evicted member triggers re-encrypt) ──────────
CREATE TABLE IF NOT EXISTS vault_rotation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  evicted_eoa     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'complete')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vault_rotation_jobs_pod_idx ON vault_rotation_jobs(pod_id);
COMMENT ON TABLE vault_rotation_jobs IS
  'Triggered when a member loses passwordsAccess. The next active reader walks pending jobs, generates new content keys, re-encrypts entries, and rewraps to current recipients only.';

-- ── access log (server-side only; no in-app UI) ───────────────────────
CREATE TABLE IF NOT EXISTS vault_access_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          UUID NOT NULL,
  entry_id        UUID,
  accessor_eoa    TEXT NOT NULL,
  action          TEXT NOT NULL
    CHECK (action IN ('read', 'create', 'update', 'delete', 'grant', 'rotate')),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vault_access_log_pod_idx ON vault_access_log(pod_id, occurred_at DESC);
COMMENT ON TABLE vault_access_log IS
  'Server-side audit trail of vault access attempts. No plaintext logged (server never sees plaintext). For incident response only; not surfaced in any UI. Query via SQL editor when investigating a suspected leak.';

-- ── pod_modules toggle column ─────────────────────────────────────────
ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS passwords_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passwords_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pod_modules.passwords_enabled IS
  'Password Vault add-on module. Off by default. Enabling auto-grants passwordsAccess to existing pod roles. End-to-end encrypted: server never sees plaintext password values.';
