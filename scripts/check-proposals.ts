import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const runId = 'dc686dcc-7d8d-42ef-b451-6da9f9b659a4';

async function checkProposals() {
  const { data, error } = await supabase
    .from('agent_proposals')
    .select('*')
    .eq('run_id', runId);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ NO PROPOSALS FOUND - Brain dump failed to save proposals');
    return;
  }

  console.log(`✅ SUCCESS: ${data.length} proposals saved\n`);
  data.forEach((p, i) => {
    console.log(`   ${i + 1}. [${p.category}-${p.priority}] ${p.title}`);
  });
}

checkProposals()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
