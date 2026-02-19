import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Comprehensive Proposal Search\n');
console.log('='.repeat(70) + '\n');

// 1. Pod-level proposals (ALL statuses)
const { data: podProposals } = await supabase
  .from('pod_level_proposals')
  .select('*')
  .order('created_at', { ascending: false });

console.log(`📋 Pod-Level Proposals: ${podProposals?.length || 0}\n`);
podProposals?.forEach((p, i) => {
  console.log(`${i + 1}. ${p.title || 'Untitled'}`);
  console.log(`   ID: ${p.id}`);
  console.log(`   Status: ${p.status}`);
  console.log(`   Pod: ${p.pod_id}`);
  console.log('');
});

console.log('='.repeat(70) + '\n');

// 2. Pods with status="proposed" (pod creation proposals)
const { data: proposedPods } = await supabase
  .from('pods')
  .select('*')
  .eq('status', 'proposed')
  .order('created_at', { ascending: false});

console.log(`📋 Pod Creation Proposals: ${proposedPods?.length || 0}\n`);
proposedPods?.forEach((p, i) => {
  console.log(`${i + 1}. ${p.name || 'Untitled Pod'}`);
  console.log(`   ID: ${p.id}`);
  console.log(`   Status: ${p.status}`);
  console.log('');
});

console.log('='.repeat(70) + '\n');

// 3. DAO-wide proposals
const { data: daoProposals } = await supabase
  .from('proposal_metadata')
  .select('*')
  .order('created_at', { ascending: false});

console.log(`📋 DAO-Wide Proposals: ${daoProposals?.length || 0}\n`);
daoProposals?.forEach((p, i) => {
  console.log(`${i + 1}. ${p.title || 'Untitled'}`);
  console.log(`   Proposal ID: ${p.proposal_id || 'N/A'}`);
  console.log(`   On-chain ID: ${p.onchain_proposal_id || 'N/A'}`);
  console.log('');
});
