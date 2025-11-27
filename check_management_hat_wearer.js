const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';
const TEST_POD_MANAGEMENT_HAT =
  '3666553570037150721174195842292195069847071659177498212523708774350848';

const client = createPublicClient({
  chain: base,
  transport: http(
    'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
  ),
});

async function checkManagementHatWearer() {
  const hatsAbi = [
    {
      name: 'isWearerOfHat',
      type: 'function',
      inputs: [
        { name: '_user', type: 'address' },
        { name: '_hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    },
    {
      name: 'isAdminOfHat',
      type: 'function',
      inputs: [
        { name: '_user', type: 'address' },
        { name: '_hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    },
  ];

  console.log('🔍 Checking Test Pod V2-46 Management HAT...\n');

  const userWearsManagementHat = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isWearerOfHat',
    args: [USER_ADDRESS, BigInt(TEST_POD_MANAGEMENT_HAT)],
  });

  const userIsAdminOfManagementHat = await client.readContract({
    address: HATS_CONTRACT,
    abi: hatsAbi,
    functionName: 'isAdminOfHat',
    args: [USER_ADDRESS, BigInt(TEST_POD_MANAGEMENT_HAT)],
  });

  console.log('👤 User Address:', USER_ADDRESS);
  console.log('  Wears Management HAT:', userWearsManagementHat);
  console.log('  Is Admin of Management HAT:', userIsAdminOfManagementHat);

  console.log('\n💡 Explanation:');
  if (userIsAdminOfManagementHat) {
    console.log('  ✅ User CAN call changeHatToggle on this HAT');
    console.log(
      '  Reason: User is admin (via Community Pod HAT or Management HAT wearer)',
    );
  } else {
    console.log('  ❌ User CANNOT call changeHatToggle on this HAT');
  }
}

checkManagementHatWearer().catch(console.error);
