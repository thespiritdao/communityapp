-- Prevent Duplicate Agreements
-- Date: 2025-11-07
-- Purpose: Document that duplicate prevention is handled at application level

-- NOTE: This migration is intentionally empty because:
-- 1. Eligibility criteria (including agreements) are stored as JSONB arrays in pod_role_permissions.eligibility_criteria
-- 2. Database constraints cannot enforce uniqueness within JSON arrays
-- 3. Duplicate prevention is enforced in the EligibilityCriteriaBuilder component instead

-- Application-level prevention happens in:
-- - src/features/pods/components/EligibilityCriteriaBuilder.tsx
-- - Checks if agreement already exists before adding a new one
-- - Shows error toast: "Agreement Already Exists for this role"

-- Example of pod_role_permissions.eligibility_criteria structure:
-- [
--   {
--     "id": "agreement_signed_1",
--     "type": "agreement_signed",
--     "config": {
--       "agreementText": "I agree to...",
--       "required": true
--     },
--     "agreement_hash": "0xabc123...",
--     "agreement_cid": "QmXyz..."
--   }
-- ]

-- No database changes needed - application logic handles duplicate prevention
