import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import BountyManagerABI from '../src/abis/BountyManagerV2.json' assert { type: 'json' };

const BOUNTY_MANAGER_ADDRESS = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';
const BOUNTY_ID = 10;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Testing getBounty call...\n');
console.log('Bounty ID:', BOUNTY_ID);
console.log('Contract:', BOUNTY_MANAGER_ADDRESS);
console.log('');

try {
  // Test 1: Raw call
  console.log('📋 Test 1: Raw getBounty call');
  const bountyData = await publicClient.readContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getBounty',
    args: [BigInt(BOUNTY_ID)],
  });

  console.log('  Raw result:', bountyData);
  console.log('  Type:', typeof bountyData);
  console.log('  Is Array:', Array.isArray(bountyData));

  if (Array.isArray(bountyData)) {
    console.log('  Array length:', bountyData.length);
    console.log('  [0] creator:', bountyData[0]);
    console.log('  [1] value:', bountyData[1]?.toString());
    console.log('  [2] token:', bountyData[2]);
    console.log('  [3] status:', bountyData[3]);
  }
  console.log('');

  // Test 2: Destructured call
  console.log('📋 Test 2: Destructured result');
  const result = await publicClient.readContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getBounty',
    args: [BigInt(BOUNTY_ID)],
  });

  const [creator, value, token, status] = result;
  console.log('  creator:', creator);
  console.log('  value:', value?.toString());
  console.log('  token:', token);
  console.log('  status:', status);
  console.log('  status type:', typeof status);
  console.log('');

  // Test 3: Direct property access
  console.log('📋 Test 3: Direct property access');
  const bountyObj = result;
  console.log('  bountyObj:', bountyObj);
  console.log('  .status property:', bountyObj.status);
  console.log('  [3] index:', bountyObj[3]);
  console.log('');

  // Test 4: Check assignment
  console.log('📋 Test 4: getAssignment for comparison');
  const assignmentData = await publicClient.readContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getAssignment',
    args: [BigInt(BOUNTY_ID)],
  });

  console.log('  Assignment data:', assignmentData);
  console.log('  Is Array:', Array.isArray(assignmentData));
  if (Array.isArray(assignmentData)) {
    console.log('  [0] bidder:', assignmentData[0]);
    console.log('  [1] reviewer:', assignmentData[1]);
    console.log('  [2] escrowAmount:', assignmentData[2]?.toString());
    console.log('  [3] paidAmount:', assignmentData[3]?.toString());
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Full error:', error);
}
