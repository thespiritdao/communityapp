-- Identity restructure (D-21): per-token category + move Advocate to Accreditations.
--
-- 1. Add a `category` column to `tokens` so individual tokens can be placed in
--    the Tenure / Credentials / Accreditations sections. Previously the identity
--    code hardcoded every tokens-table row to 'membership'; it now reads this
--    column (default 'membership' for backward-compat).
-- 2. Move Advocate out of the old Membership section into Accreditations — it is
--    a granted credential (earned by donating), not a tenure band. The Tenure
--    section is now the on-chain $SELF prestige band (Curious→Elder), which is
--    NOT a tokens-table row, so nothing else needs to move.
-- 3. Swap the Advocate image to the new members/ asset set.
--
-- Apply manually via the Supabase SQL editor (project convention).

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'membership'
  CHECK (category IN ('membership', 'credential', 'accreditation'));

-- Advocate (0x3f0A79ff40D8e15933f24A9F7D0baAdCD7577759) → Accreditations,
-- with the new image. Match case-insensitively on contract_address.
UPDATE tokens
SET
  category = 'accreditation',
  token_image = '/images/members/advocatesquare500x.jpg'
WHERE lower(contract_address) = lower('0x3f0A79ff40D8e15933f24A9F7D0baAdCD7577759');
