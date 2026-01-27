import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import BountyManagerABI from '../src/abis/BountyManagerV2.json' assert { type: 'json' };

const BOUNTY_MANAGER_ADDRESS = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';
const BOUNTY_ID = 10;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Checking bounty assignment on-chain...\n');
console.log('Bounty ID:', BOUNTY_ID);
console.log('Contract:', BOUNTY_MANAGER_ADDRESS);
console.log('');

try {
  const assignmentData = await publicClient.readContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getAssignment',
    args: [BigInt(BOUNTY_ID)],
  });

  console.log('📦 Assignment Data (raw):', assignmentData);
  console.log('');
  console.log('🎯 Assignment Status:');
  console.log('  Bidder (assignmentData[0]):', assignmentData[0] || 'Not assigned');
  console.log('  Reviewer (assignmentData[1]):', assignmentData[1] || 'Not set');
  console.log('  Escrow Amount (assignmentData[2]):', assignmentData[2]?.toString() || '0');

  if (assignmentData[0] && assignmentData[0] !== '0x0000000000000000000000000000000000000000') {
    console.log('\n✅ Bounty IS assigned to:', assignmentData[0]);
  } else {
    console.log('\n⚠️ Bounty is NOT assigned yet');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}
