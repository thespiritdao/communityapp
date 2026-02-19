import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const GOVERNOR = '0x9711A044B18DCa5EC6caa9b71DE07B98fd5238e5';
const SMART_ACCOUNT = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48';
const PROPOSAL_ID = '62220475974527353399025126332943188804777452634903779818927770175016718982802';

console.log('🔍 Testing DAO_Governor Contract\n');
console.log('='.repeat(70) + '\n');

const GOV_ABI = parseAbi([
  'function castVote(uint256 proposalId, uint8 support) external returns (uint256)',
  'function hasVoted(uint256 proposalId, address account) external view returns (bool)',
  'function state(uint256 proposalId) external view returns (uint8)',
]);

// 1. Check proposal state
try {
  const state = await client.readContract({
    address: GOVERNOR,
    abi: GOV_ABI,
    functionName: 'state',
    args: [BigInt(PROPOSAL_ID)],
  });

  const stateNames = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
  console.log('Proposal State:', state, '→', stateNames[state] || 'Unknown');

  if (state !== 1) {
    console.log('❌ Proposal is NOT in Active state!');
    console.log('   Only Active proposals can be voted on.');
    console.log('   Current state:', stateNames[state]);
  } else {
    console.log('✅ Proposal is Active - voting should be possible');
  }
} catch (error) {
  console.log('❌ Error checking state:', error.message);
}

console.log('');

// 2. Check if already voted
try {
  const hasVoted = await client.readContract({
    address: GOVERNOR,
    abi: GOV_ABI,
    functionName: 'hasVoted',
    args: [BigInt(PROPOSAL_ID), SMART_ACCOUNT],
  });

  console.log('Has Voted:', hasVoted);

  if (hasVoted) {
    console.log('❌ User has already voted on this proposal!');
  }
} catch (error) {
  console.log('❌ Error checking hasVoted:', error.message);
}

console.log('');

// 3. Try to simulate the vote
try {
  await client.simulateContract({
    address: GOVERNOR,
    abi: GOV_ABI,
    functionName: 'castVote',
    args: [BigInt(PROPOSAL_ID), 1], // 1 = For
    account: SMART_ACCOUNT,
  });

  console.log('✅ Vote simulation SUCCEEDED!');
  console.log('   The contract would accept this vote.');
  console.log('   The issue must be CDP Paymaster configuration or propagation delay.');
} catch (error) {
  console.log('❌ Vote simulation FAILED');
  console.log('Error:', error.message);

  if (error.message.includes('GovernorUnexpectedProposalState')) {
    console.log('\n🔍 Proposal is not in correct state for voting');
  } else if (error.message.includes('already cast')) {
    console.log('\n🔍 User has already voted');
  } else {
    console.log('\n🔍 Contract rejected the vote for another reason');
  }
}
