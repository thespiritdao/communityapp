-- Email invites + pod invite links (spec-email-invites-and-pod-links.md)
-- Run manually in the Supabase SQL editor per project convention.

-- 1. Email invites — one row per invitation sent. Gives dedup, attribution,
--    and a future "your invite was accepted" hook.
CREATE TABLE IF NOT EXISTS email_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_wallet   TEXT NOT NULL,
  email           TEXT NOT NULL,
  pod_id          UUID REFERENCES pods(id) ON DELETE SET NULL,
  invite_code     TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  accepted_wallet TEXT
);
CREATE INDEX IF NOT EXISTS email_invites_sender_idx ON email_invites(sender_wallet, sent_at);
CREATE INDEX IF NOT EXISTS email_invites_email_idx ON email_invites(email);

-- 2. Pod invite links — leader-created, member-role-only, expiring/limited.
CREATE TABLE IF NOT EXISTS pod_invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id     UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  code       TEXT UNIQUE NOT NULL,
  role_id    UUID,                -- pod_role_permissions.id of the member role to grant
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses   INTEGER,
  use_count  INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pod_invite_links_pod_idx ON pod_invite_links(pod_id);

-- 3. Acceptances — the Option A "pending hat mint" queue. DB membership is
--    granted immediately at accept; hat_minted_at is set when a leader
--    batch-mints the on-chain hat.
CREATE TABLE IF NOT EXISTS pod_invite_acceptances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id        UUID NOT NULL REFERENCES pod_invite_links(id) ON DELETE CASCADE,
  pod_id         UUID NOT NULL,
  wallet         TEXT NOT NULL,
  hat_id         TEXT,            -- the member hat to mint (from the role at accept time)
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hat_minted_at  TIMESTAMPTZ,
  mint_tx_hash   TEXT,
  UNIQUE(link_id, wallet)
);
CREATE INDEX IF NOT EXISTS pod_invite_acceptances_pending_idx
  ON pod_invite_acceptances(pod_id) WHERE hat_minted_at IS NULL;

-- All three tables are accessed exclusively through service-role API routes.
ALTER TABLE email_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_invite_acceptances ENABLE ROW LEVEL SECURITY;
