import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROPOSAL_ID = '480a9f2a-1cfa-4ffb-bf99-5ebf95e2d089';

console.log('🔍 Looking for Proposal:', PROPOSAL_ID, '\n');
console.log('='.repeat(70) + '\n');

// Check pod_level_proposals
const { data: podProp, error: podError } = await supabase
  .from('pod_level_proposals')
  .select('*')
  .eq('id', PROPOSAL_ID)
  .single();

if (!podError && podProp) {
  console.log('✅ Found in pod_level_proposals:\n');
  console.log(JSON.stringify(podProp, null, 2));
} else {
  console.log('❌ Not in pod_level_proposals');
}

console.log('\n' + '='.repeat(70) + '\n');

// Check proposal_metadata
const { data: metaProp, error: metaError } = await supabase
  .from('proposal_metadata')
  .select('*')
  .eq('proposal_id', PROPOSAL_ID)
  .single();

if (!metaError && metaProp) {
  console.log('✅ Found in proposal_metadata:\n');
  console.log(JSON.stringify(metaProp, null, 2));
} else {
  console.log('❌ Not in proposal_metadata');
}

console.log('\n' + '='.repeat(70) + '\n');

// Check pods table (might be a pod creation proposal)
const { data: pod, error: podTableError } = await supabase
  .from('pods')
  .select('*')
  .eq('id', PROPOSAL_ID)
  .single();

if (!podTableError && pod) {
  console.log('✅ Found in pods table (pod creation proposal):\n');
  console.log(JSON.stringify(pod, null, 2));
} else {
  console.log('❌ Not in pods table');
}
