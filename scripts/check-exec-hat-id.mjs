// scripts/check-exec-hat-id.mjs
// Prints the Executive Pod Leader hat ID from pod_role_permissions so deploy
// scripts (e.g. deploy-agent-registry.cjs) can be verified against the live tree.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from('pod_role_permissions')
  .select('pod_id, role_name, token_address, is_active')
  .ilike('role_name', '%Executive%');

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}
for (const row of data ?? []) {
  console.log(`${row.role_name} (pod ${row.pod_id}, active=${row.is_active}):`);
  console.log(`  ${row.token_address}`);
}
