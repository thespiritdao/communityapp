const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const COMMUNITY_POD_HAT = '0x0000008800020000000000000000000000000000000000000000000000000000';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';
const SAFE_ADDRESS = '0x023DF148f7199d5233a9E1c0ea4a350E85b1DB23';

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50')
});

async function checkWearers() {
  const hatsAbi = [{
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }, {
    name: 'getAdminAtLevel',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_level', type: 'uint8' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }];

  console.log('🔍 Checking Community Pod HAT Wearers...\n');
  
  const userWears = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isWearerOfHat',
    args: [USER_ADDRESS, BigInt(COMMUNITY_POD_HAT)]
  });
  
  const safeWears = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isWearerOfHat',
    args: [SAFE_ADDRESS, BigInt(COMMUNITY_POD_HAT)]
  });
  
  console.log('👤 User Address:', USER_ADDRESS);
  console.log('  Wears Community Pod HAT:', userWears);
  
  console.log('\n🏦 Safe Multisig:', SAFE_ADDRESS);
  console.log('  Wears Community Pod HAT:', safeWears);
  
  // Check what the admin of Community Pod is
  const testPodManagementHat = '3666553570037150721174195842292195069847071659177498212523708774350848';
  const adminHat = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'getAdminAtLevel',
    args: [BigInt(testPodManagementHat), 0]
  });
  
  console.log('\n🎩 Test Pod V2-46 Management HAT Admin:');
  console.log('  Admin HAT ID:', '0x' + adminHat.toString(16).padStart(64, '0'));
  console.log('  Is Community Pod:', adminHat === BigInt(COMMUNITY_POD_HAT));
}

checkWearers().catch(console.error);
