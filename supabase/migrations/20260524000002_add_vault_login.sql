-- Add encrypted login field to vault entries.
--
-- The original schema only had label, tags, password, and notes —
-- meaning users had to bury the login (username / email / account ID)
-- inside the free-text notes. That's bad UX. Logins are first-class
-- credential material; they get their own field.
--
-- Like password and notes, the login is encrypted under the entry's
-- content key (AES-GCM-256). Same wrap chain to recipients; no
-- changes to vault_wrapped_keys.

ALTER TABLE vault_entries
  ADD COLUMN IF NOT EXISTS login_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS login_iv TEXT;

COMMENT ON COLUMN vault_entries.login_ciphertext IS
  'AES-GCM-encrypted login (username / email / account ID), under the same content key as password_ciphertext. Nullable for legacy entries created before this column existed.';
