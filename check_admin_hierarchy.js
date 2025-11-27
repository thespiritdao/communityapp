const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const COMMUNITY_POD_HAT = '0x0000008800020000000000000000000000000000000000000000000000000000';
const EXECUTIVE_POD_HAT = '0x0000008800010000000000000000000000000000000000000000000000000000';
const TOP_HAT = '0x0000008800000000000000000000000000000000000000000000000000000000';

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50')
});

async function checkAdminHierarchy() {
  console.log('🔍 Checking HAT Admin Hierarchy...\n');
  
  const hatsAbi = [{
    name: 'viewHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'supply', type: 'uint32' },
      { name: 'eligibility', type: 'address' },
      { name: 'toggle', type: 'address' },
      { name: 'imageURI', type: 'string' },
      { name: 'numChildren', type: 'uint16' },
      { name: 'mutable', type: 'bool' },
      { name: 'active', type: 'bool' }
    ],
    stateMutability: 'view'
  }, {
    name: 'isAdminOfHat',
    type: 'function',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }];

  // Check Community Pod HAT
  const communityPodDetails = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'viewHat',
    args: [BigInt(COMMUNITY_POD_HAT)]
  });
  
  console.log('📊 Community Pod HAT:');
  console.log('  HAT ID:', COMMUNITY_POD_HAT);
  console.log('  Supply:', communityPodDetails[2]); // Current wearers
  console.log('  Max Supply:', communityPodDetails[1]);
  console.log('  Active:', communityPodDetails[8]);
  
  // Check if Community Pod admin can be determined from parent
  console.log('\n📊 Top HAT:');
  const topHatDetails = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'viewHat',
    args: [BigInt(TOP_HAT)]
  });
  console.log('  HAT ID:', TOP_HAT);
  console.log('  Supply:', topHatDetails[2]);
  console.log('  Active:', topHatDetails[8]);
  
  // Check if your wallet can admin Community Pod children
  const userAddress = '0x12a0cf22D632c859B793F852af03b9d515580244';
  const isUserAdminOfCommunityPod = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isAdminOfHat',
    args: [userAddress, BigInt(COMMUNITY_POD_HAT)]
  });
  
  console.log('\n🔐 User Admin Permissions:');
  console.log('  User Address:', userAddress);
  console.log('  Is Admin of Community Pod HAT:', isUserAdminOfCommunityPod);
  
  // Check Test Pod V2-46 Management HAT
  const testPodManagementHat = '3666553570037150721174195842292195069847071659177498212523708774350848';
  const isUserAdminOfTestPod = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isAdminOfHat',
    args: [userAddress, BigInt(testPodManagementHat)]
  });
  
  console.log('  Is Admin of Test Pod V2-46 Management HAT:', isUserAdminOfTestPod);
}

checkAdminHierarchy().catch(console.error);
