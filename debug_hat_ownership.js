const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// CONFIGURATION - UPDATE THESE VALUES
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const POD_ID = 'test-pod-v2-47'; // Replace with your pod ID
const MANAGEMENT_HAT_ID =
  '3666553570037150721174195842292195069847071659177498212523708774352896'; // Replace with your Management HAT ID
const YOUR_EOA_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244'; // Replace with your EOA
const YOUR_SMART_WALLET = '0xYourSmartWalletAddress'; // Replace with your Coinbase Smart Wallet address

const client = createPublicClient({
  chain: base,
  transport: http(
    'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
  ),
});

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
  {
    name: 'viewHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'details', type: 'string' },
          { name: 'maxSupply', type: 'uint32' },
          { name: 'supply', type: 'uint32' },
          { name: 'eligibility', type: 'address' },
          { name: 'toggle', type: 'address' },
          { name: 'imageURI', type: 'string' },
          { name: 'numChildren', type: 'uint16' },
          { name: 'mutable', type: 'bool' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
];

async function debugHatOwnership() {
  console.log('🔍 === DEBUGGING HAT OWNERSHIP ===\n');
  console.log('Pod ID:', POD_ID);
  console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
  console.log('Your EOA:', YOUR_EOA_ADDRESS);
  console.log('Your Smart Wallet:', YOUR_SMART_WALLET);
  console.log();

  try {
    // Check HAT details
    const hatDetails = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'viewHat',
      args: [BigInt(MANAGEMENT_HAT_ID)],
    });

    console.log('📊 Management HAT Details:');
    console.log('  Max Supply:', hatDetails.maxSupply);
    console.log('  Current Supply:', hatDetails.supply);
    console.log('  Active:', hatDetails.active);
    console.log('  Eligibility Module:', hatDetails.eligibility);
    console.log('  Toggle Module:', hatDetails.toggle);
    console.log();

    // Check if EOA wears the HAT
    const eoaWearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_EOA_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
    });

    // Check if smart wallet wears the HAT
    const smartWalletWearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_SMART_WALLET, BigInt(MANAGEMENT_HAT_ID)],
    });

    // Check admin status
    const eoaIsAdmin = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isAdminOfHat',
      args: [YOUR_EOA_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
    });

    const smartWalletIsAdmin = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isAdminOfHat',
      args: [YOUR_SMART_WALLET, BigInt(MANAGEMENT_HAT_ID)],
    });

    console.log('👤 YOUR EOA ADDRESS:', YOUR_EOA_ADDRESS);
    console.log('  Wears Management HAT:', eoaWearsHat ? '✅ YES' : '❌ NO');
    console.log(
      '  Is Admin of Management HAT:',
      eoaIsAdmin ? '✅ YES' : '❌ NO',
    );
    console.log();

    console.log('💼 YOUR SMART WALLET:', YOUR_SMART_WALLET);
    console.log(
      '  Wears Management HAT:',
      smartWalletWearsHat ? '✅ YES' : '❌ NO',
    );
    console.log(
      '  Is Admin of Management HAT:',
      smartWalletIsAdmin ? '✅ YES' : '❌ NO',
    );
    console.log();

    console.log('🔍 === DIAGNOSIS ===');
    if (eoaWearsHat && !smartWalletWearsHat) {
      console.log('❌ PROBLEM IDENTIFIED:');
      console.log('   - Management HAT is owned by your EOA');
      console.log('   - Smart wallet does NOT own the HAT');
      console.log(
        '   - When you send transactions via smart wallet, msg.sender is the smart wallet',
      );
      console.log(
        "   - Factory authorization check fails because smart wallet doesn't wear the HAT",
      );
      console.log();
      console.log('💡 SOLUTIONS:');
      console.log('   1. Mint the Management HAT to your smart wallet address');
      console.log(
        '   2. Update factory authorization to check smart wallet owner (EOA)',
      );
      console.log(
        '   3. Use EOA directly instead of smart wallet for management operations',
      );
    } else if (smartWalletWearsHat) {
      console.log('✅ Smart wallet owns the HAT - authorization should work');
      console.log("   If you're still seeing errors, the issue is elsewhere.");
    } else if (!eoaWearsHat && !smartWalletWearsHat) {
      console.log('❌ NEITHER address owns the HAT!');
      console.log('   HAT may have been minted to a different address.');
      console.log(
        '   Check who actually owns the HAT by querying the Hats contract.',
      );
    }
  } catch (error) {
    console.error('❌ Error checking HAT ownership:', error);
  }
}

debugHatOwnership().catch(console.error);
