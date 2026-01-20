-- Fix the remaining two pods with mixed case addresses

BEGIN;

-- Show current state
SELECT
  'Before Fix' as status,
  id,
  name,
  pod_leads
FROM pods
WHERE id IN (
  '96760362-c7d1-499c-97b0-359333caf228',  -- Test Pod
  'f2bc166d-33d5-47dc-8409-ea8d445d3fc0'   -- Temporal naturalism
);

-- Fix Test Pod
UPDATE pods
SET pod_leads = ARRAY['0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48']
WHERE id = '96760362-c7d1-499c-97b0-359333caf228';

-- Fix Temporal naturalism
UPDATE pods
SET pod_leads = ARRAY[
  '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48',
  '0x12a0cf22d632c859b793f852af03b9d515580244',
  '0xaecf4d00f0e402fbeb0757f22be9062d89018106'
]
WHERE id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

-- Verify the fix
SELECT
  'After Fix ✅' as status,
  id,
  name,
  pod_leads,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM unnest(pod_leads) as lead
      WHERE lead != LOWER(lead)
    )
    THEN '❌ Still has mixed case'
    ELSE '✅ All lowercase'
  END as verification
FROM pods
WHERE id IN (
  '96760362-c7d1-499c-97b0-359333caf228',
  'f2bc166d-33d5-47dc-8409-ea8d445d3fc0'
);

COMMIT;

-- Final verification: Check ALL pods
SELECT
  'Final Check: All Pods' as status,
  COUNT(*) as total_pods,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(pod_leads) as lead
      WHERE lead != LOWER(lead)
    )
  ) as all_lowercase_count,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM unnest(pod_leads) as lead
      WHERE lead != LOWER(lead)
    )
  ) as mixed_case_count,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM unnest(pod_leads) as lead
        WHERE lead != LOWER(lead)
      )
    ) = 0
    THEN '✅ ALL PODS NOW LOWERCASE'
    ELSE '❌ Some pods still have mixed case'
  END as final_status
FROM pods
WHERE pod_leads IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Remaining mixed case addresses fixed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed pods:';
  RAISE NOTICE '• Test Pod';
  RAISE NOTICE '• Temporal naturalism';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '2. Try creating a chat channel';
  RAISE NOTICE '3. RLS should now work!';
END $$;
