-- Add decimals + minimum_balance to the tokens table.
--
-- Context: the eligibility framework can gate a pod role on an arbitrary ERC-20
-- balance (EligibilityService `token_balance` criterion), but evaluating a
-- threshold like "$TGN >= 2000" requires normalizing a raw on-chain balance
-- (wei) by the token's decimals. The tokens table had no decimals column, so
-- arbitrary ERC-20 thresholds could not be evaluated. This adds it.
--
-- TreeGens ($TGN on Base) is the first consumer; the column is generic so any
-- future community token can be registered and gated the same way.
--
-- Idempotent: safe to re-run.

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS decimals INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS minimum_balance TEXT,
  ADD COLUMN IF NOT EXISTS gating_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tokens.decimals IS
  'ERC-20 decimals used to normalize raw balanceOf (wei) before threshold comparison. Defaults to 18.';
COMMENT ON COLUMN tokens.minimum_balance IS
  'Optional default threshold (human-readable) suggested when gating a role on this token. Per-role criteria may override.';
COMMENT ON COLUMN tokens.gating_enabled IS
  'Governance guardrail: a token may gate a pod role / vote ONLY when explicitly blessed by an admin (TRUE). Third-party community tokens function as governance signals only — never issued, held, or exchanged by the platform. Defaults FALSE so a newly registered token cannot gate anything until deliberately enabled.';
