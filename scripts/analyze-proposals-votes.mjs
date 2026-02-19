import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Comprehensive Proposal & Vote Analysis\n');
console.log('='.repeat(70) + '\n');

// 1. Check pods with status='proposed'
console.log('1️⃣  POD CREATION PROPOSALS (pods table):\n');
const { data: proposedPods } = await supabase
  .from('pods')
  .select('*')
  .eq('status', 'proposed')
  .order('created_at', { ascending: false })
  .limit(3);

if (proposedPods && proposedPods.length > 0) {
  proposedPods.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name || 'Untitled'}`);
    console.log(`      ID: ${p.id}`);
    console.log(`      Created: ${p.created_at}`);
    console.log('');
  });
} else {
  console.log('   No pod creation proposals found\n');
}

console.log('='.repeat(70) + '\n');

// 2. Check pod_level_proposals
console.log('2️⃣  POD-LEVEL PROPOSALS (pod_level_proposals table):\n');
const { data: podLevelProps } = await supabase
  .from('pod_level_proposals')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(3);

if (podLevelProps && podLevelProps.length > 0) {
  podLevelProps.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title || 'Untitled'}`);
    console.log(`      ID: ${p.id}`);
    console.log(`      Pod: ${p.pod_id}`);
    console.log(`      Status: ${p.status}`);
    console.log(`      Created: ${p.created_at}`);
    console.log('');
  });
} else {
  console.log('   No pod-level proposals found\n');
}

console.log('='.repeat(70) + '\n');

// 3. Check recent governance proposals
console.log('3️⃣  GOVERNANCE PROPOSALS (proposal_metadata table):\n');
const { data: govProps } = await supabase
  .from('proposal_metadata')
  .select('id, title, onchain_proposal_id, status, created_at')
  .order('created_at', { ascending: false })
  .limit(3);

if (govProps && govProps.length > 0) {
  govProps.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title || 'Untitled'}`);
    console.log(`      UUID: ${p.id}`);
    console.log(`      On-chain ID: ${p.onchain_proposal_id}`);
    console.log(`      Status: ${p.status}`);
    console.log('');
  });
}

console.log('='.repeat(70) + '\n');

// 4. Check votes for the most recent proposals
console.log('4️⃣  RECENT VOTES (governance_votes table):\n');
const { data: votes } = await supabase
  .from('governance_votes')
  .select('*')
  .order('timestamp', { ascending: false })
  .limit(5);

if (votes && votes.length > 0) {
  votes.forEach((v, i) => {
    console.log(`   ${i + 1}. Proposal: ${v.proposal_id?.substring(0, 20)}...`);
    console.log(`      Voter: ${v.voter_address}`);
    console.log(`      Vote: ${v.vote}`);
    console.log(`      Time: ${v.timestamp}`);
    console.log('');
  });
} else {
  console.log('   No votes found\n');
}

console.log('='.repeat(70) + '\n');
console.log('📊 SUMMARY:\n');
console.log(`   Pod Creation Proposals: ${proposedPods?.length || 0}`);
console.log(`   Pod-Level Proposals: ${podLevelProps?.length || 0}`);
console.log(`   Governance Proposals: ${govProps?.length || 0}`);
console.log(`   Recent Votes: ${votes?.length || 0}`);
console.log('');

// 5. If there are pod creation proposals, check their votes
if (proposedPods && proposedPods.length > 0) {
  console.log('='.repeat(70) + '\n');
  console.log('5️⃣  VOTES ON POD CREATION PROPOSALS:\n');

  for (const pod of proposedPods) {
    const { data: podVotes } = await supabase
      .from('governance_votes')
      .select('*')
      .eq('proposal_id', pod.id);

    console.log(`   Pod: ${pod.name}`);
    console.log(`   Votes: ${podVotes?.length || 0}`);

    if (podVotes && podVotes.length > 0) {
      podVotes.forEach(v => {
        console.log(`      - ${v.vote} by ${v.voter_address.substring(0, 10)}...`);
      });
    }
    console.log('');
  }
}
