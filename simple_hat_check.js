const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// CONFIGURATION - UPDATE THESE
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const YOUR_EOA_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';
const YOUR_SMART_WALLET = ''; // Leave empty if unknown - we'll skip smart wallet check
const MANAGEMENT_HAT_ID = '3666553570037151104296619557127078756515624761922077834188833387708416'; // ✅ CORRECT HAT ID from Supabase

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50')
});

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
  name: 'isAdminOfHat',
  type: 'function',
  inputs: [
    { name: '_user', type: 'address' },
    { name: '_hatId', type: 'uint256' }
  ],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view'
}, {
  name: 'balanceOf',
  type: 'function',
  inputs: [
    { name: 'wearer', type: 'address' },
    { name: 'hatId', type: 'uint256' }
  ],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view'
}];

async function simpleHatCheck() {
  console.log('🔍 === SIMPLE HAT OWNERSHIP CHECK ===\n');
  console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
  console.log('HAT ID (hex):', '0x' + BigInt(MANAGEMENT_HAT_ID).toString(16).padStart(64, '0'));
  console.log();

  try {
    // Method 1: isWearerOfHat (most reliable)
    console.log('Method 1: Checking isWearerOfHat...\n');

    const eoaWearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_EOA_ADDRESS, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log('👤 YOUR EOA:', YOUR_EOA_ADDRESS);
    console.log('   Wears Management HAT:', eoaWearsHat ? '✅ YES' : '❌ NO');

    const eoaIsAdmin = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isAdminOfHat',
      args: [YOUR_EOA_ADDRESS, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log('   Is Admin of Management HAT:', eoaIsAdmin ? '✅ YES' : '❌ NO');
    console.log();

    // Method 2: balanceOf (alternative check)
    const eoaBalance = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'balanceOf',
      args: [YOUR_EOA_ADDRESS, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log('Method 2: HAT Balance Check');
    console.log('   EOA HAT Balance:', eoaBalance.toString(), eoaBalance > 0 ? '✅ (owns HAT)' : '❌ (no HAT)');
    console.log();

    // Check smart wallet if provided
    if (YOUR_SMART_WALLET && YOUR_SMART_WALLET.length > 0 && YOUR_SMART_WALLET.startsWith('0x')) {
      console.log('💼 SMART WALLET:', YOUR_SMART_WALLET);

      const smartWalletWearsHat = await client.readContract({
        address: HATS_CONTRACT,
        abi: hatsAbi,
        functionName: 'isWearerOfHat',
        args: [YOUR_SMART_WALLET, BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log('   Wears Management HAT:', smartWalletWearsHat ? '✅ YES' : '❌ NO');

      const smartWalletIsAdmin = await client.readContract({
        address: HATS_CONTRACT,
        abi: hatsAbi,
        functionName: 'isAdminOfHat',
        args: [YOUR_SMART_WALLET, BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log('   Is Admin of Management HAT:', smartWalletIsAdmin ? '✅ YES' : '❌ NO');

      const smartWalletBalance = await client.readContract({
        address: HATS_CONTRACT,
        abi: hatsAbi,
        functionName: 'balanceOf',
        args: [YOUR_SMART_WALLET, BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log('   HAT Balance:', smartWalletBalance.toString(), smartWalletBalance > 0 ? '✅' : '❌');
      console.log();

      // Diagnosis
      if (eoaWearsHat && !smartWalletWearsHat) {
        console.log('🚨 PROBLEM CONFIRMED:');
        console.log('   ❌ Your EOA has the HAT, but your Smart Wallet does NOT');
        console.log('   ❌ When you send transactions via Smart Wallet, authorization fails');
        console.log('   ✅ Solution: Use EOA wallet directly for management operations');
      } else if (smartWalletWearsHat) {
        console.log('✅ Both addresses have the HAT - authorization should work from either');
      }
    } else {
      console.log('ℹ️  Smart Wallet address not provided - skipping smart wallet check');
      console.log('   Run find_smart_wallet.js to locate your smart wallet address');
      console.log();

      if (eoaWearsHat) {
        console.log('✅ Your EOA has the Management HAT');
        console.log('💡 If you\'re getting authorization errors:');
        console.log('   1. Make sure you\'re connecting with your EOA, not a smart wallet');
        console.log('   2. Check browser console to see what address is sending transactions');
        console.log('   3. That address needs to wear the Management HAT');
      } else {
        console.log('❌ Your EOA does NOT have the Management HAT!');
        console.log('⚠️  This is unexpected - the HAT should have been minted during pod creation');
        console.log('🔍 Possible issues:');
        console.log('   1. Wrong Management HAT ID (check pod creation logs)');
        console.log('   2. HAT was minted to a different address');
        console.log('   3. HAT minting transaction failed but pod was created');
      }
    }

  } catch (error) {
    console.error('❌ Error checking HAT ownership:', error.message);
    console.log();
    console.log('🔍 Troubleshooting:');
    console.log('   1. Verify the Management HAT ID is correct');
    console.log('   2. Check if the HAT was actually created on-chain');
    console.log('   3. Look at pod creation transaction logs to find the correct HAT ID');
  }
}

simpleHatCheck().catch(console.error);
