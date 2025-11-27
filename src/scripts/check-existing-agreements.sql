-- Check existing agreement criteria in pods
SELECT 
  pods.name as pod_name,
  prp.role_name,
  prp.eligibility_criteria
FROM pod_role_permissions prp
JOIN pods ON pods.id = prp.pod_id
WHERE prp.eligibility_criteria::text ILIKE '%agreement%'
   OR prp.eligibility_criteria::text ILIKE '%agreement_text%'
   OR prp.eligibility_criteria::text ILIKE '%agreement_signed%';

-- Check any existing accountability signatures
SELECT 
  pas.id,
  pas.pod_id,
  pas.signer_address,
  pas.accountability_statement,
  pas.signed_at,
  pods.name as pod_name
FROM pod_accountability_signatures pas
JOIN pods ON pods.id = pas.pod_id
ORDER BY pas.signed_at DESC
LIMIT 10;

-- Check pod membership applications
SELECT 
  pma.id,
  pma.pod_id,
  pma.applicant_address,
  pma.status,
  pma.created_at,
  pods.name as pod_name
FROM pod_membership_applications pma
JOIN pods ON pods.id = pma.pod_id
ORDER BY pma.created_at DESC
LIMIT 10;