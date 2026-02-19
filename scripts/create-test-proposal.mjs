import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔧 Creating Test Pod-Level Proposal\n');
console.log('='.repeat(70) + '\n');

// Get Beta Testers Pod ID
const { data: pods } = await supabase
  .from('pods')
  .select('id, name')
  .eq('name', 'Beta Testers')
  .single();

if (!pods) {
  console.error('❌ Beta Testers pod not found');
  process.exit(1);
}

console.log('Found pod:', pods.name, '(', pods.id, ')\n');

// Create test proposal
const testProposal = {
  pod_id: pods.id,
  title: 'Test Proposal for Voting',
  description: 'This is a test proposal to validate on-chain voting functionality',
  proposal_type: 'pod_level',
  status: 'active',
  created_at: new Date().toISOString(),
  voting_start: new Date().toISOString(),
  voting_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  created_by: '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48',
};

const { data: proposal, error } = await supabase
  .from('pod_level_proposals')
  .insert([testProposal])
  .select()
  .single();

if (error) {
  console.error('❌ Error creating proposal:', error.message);
  process.exit(1);
}

console.log('✅ Test proposal created!\n');
console.log('Proposal ID:', proposal.id);
console.log('Title:', proposal.title);
console.log('Pod:', pods.name);
console.log('Status:', proposal.status);
console.log('');
console.log('🎯 Now try voting on this proposal!');
console.log('');
console.log('Go to: https://your-app/governance');
console.log('Find: "Test Proposal for Voting"');
console.log('Click: For / Against / Abstain');
