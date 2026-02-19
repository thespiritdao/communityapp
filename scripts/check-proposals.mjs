import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking Proposals in Database\n');
console.log('='.repeat(70) + '\n');

// Check pod_level_proposals
const { data: podProposals, error: podError } = await supabase
  .from('pod_level_proposals')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);

if (podError) {
  console.error('Error checking pod_level_proposals:', podError.message);
} else {
  console.log(`📋 Pod-Level Proposals (${podProposals?.length || 0} found):\n`);

  if (podProposals && podProposals.length > 0) {
    podProposals.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title || 'Untitled'}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   Pod: ${p.pod_id}`);
      console.log(`   Type: ${p.proposal_type}`);
      console.log(`   Status: ${p.status}`);
      console.log(`   Created: ${p.created_at}`);
      console.log('');
    });
  }
}

console.log('='.repeat(70) + '\n');

// Check proposal_metadata
const { data: metadata, error: metaError } = await supabase
  .from('proposal_metadata')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);

if (metaError) {
  console.error('Error checking proposal_metadata:', metaError.message);
} else {
  console.log(`📋 DAO-Wide Proposals (${metadata?.length || 0} found):\n`);

  if (metadata && metadata.length > 0) {
    metadata.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title || 'Untitled'}`);
      console.log(`   ID: ${p.proposal_id}`);
      console.log(`   Type: ${p.proposal_type}`);
      console.log(`   Created: ${p.created_at}`);
      console.log('');
    });
  }
}
