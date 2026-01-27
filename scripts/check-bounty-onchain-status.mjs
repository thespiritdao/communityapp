import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import BountyManagerABI from '../src/abis/BountyManagerV2.json' assert { type: 'json' };

const BOUNTY_MANAGER_ADDRESS = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Check on-chain status for a bounty
 */
async function checkBountyStatus(bountyId) {
  try {
    const [creator, value, token, status] = await publicClient.readContract({
      address: BOUNTY_MANAGER_ADDRESS,
      abi: BountyManagerABI,
      functionName: 'getBounty',
      args: [BigInt(bountyId)],
    });

    const statusNames = ['Open', 'Assigned', 'Completed', 'Cancelled'];

    return {
      bountyId,
      creator,
      value: value?.toString(),
      token,
      status,
      statusName: statusNames[status] || 'Unknown',
    };
  } catch (error) {
    return {
      bountyId,
      error: error.message,
    };
  }
}

// Check bounty #10 specifically
console.log('🔍 Checking bounty status on-chain...\n');

const result = await checkBountyStatus(10);

console.log('Result:', result);

// Export for use in other scripts
export { checkBountyStatus };
