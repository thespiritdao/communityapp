// Script to initialize vote counts for proposals that don't have entries yet
// This creates 0-vote entries for all proposals in the database

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🚀 Initializing vote counts for proposals without entries...\n');

// 1. Get all proposals from metadata table
const { data: proposals, error: proposalError } = await supabaseAdmin
  .from('proposal_metadata')
  .select('onchain_proposal_id')
  .not('onchain_proposal_id', 'like', 'temp_%'); // Exclude pending proposals

if (proposalError) {
  console.error('❌ Failed to fetch proposals:', proposalError);
  process.exit(1);
}

console.log(`📋 Found ${proposals.length} on-chain proposals\n`);

// 2. Get existing vote count entries
const { data: existingVoteCounts } = await supabaseAdmin
  .from('governance_proposal_votes')
  .select('proposal_id');

const existingIds = new Set(existingVoteCounts?.map(v => v.proposal_id) || []);
console.log(`✅ ${existingIds.size} proposals already have vote count entries\n`);

// 3. Find proposals that need initialization
const proposalsNeedingInit = proposals.filter(
  p => !existingIds.has(p.onchain_proposal_id)
);

console.log(`🔧 ${proposalsNeedingInit.length} proposals need initialization\n`);

if (proposalsNeedingInit.length === 0) {
  console.log('✨ All proposals already have vote count entries!');
  process.exit(0);
}

// 4. Create vote count entries with 0 votes
const entriesToInsert = proposalsNeedingInit.map(p => ({
  proposal_id: p.onchain_proposal_id,
  for_votes: '0',
  against_votes: '0',
  abstain_votes: '0',
  total_votes: '0',
  last_updated_block: '0',
}));

const { error: insertError } = await supabaseAdmin
  .from('governance_proposal_votes')
  .insert(entriesToInsert);

if (insertError) {
  console.error('❌ Failed to insert vote counts:', insertError);
  process.exit(1);
}

console.log(`✅ Initialized vote counts for ${entriesToInsert.length} proposals`);
console.log('\n✨ Done! All proposals now have vote count entries.');
