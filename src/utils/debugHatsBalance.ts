/**
 * Debug utility for checking Hats Protocol token balances
 * This helps identify why executive pod permissions aren't working
 */

import Web3 from 'web3';

const HATS_ABI = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" }
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "_hatId", type: "uint256" }
    ],
    name: "isActive",
    outputs: [{ internalType: "bool", name: "active", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_wearer", type: "address" },
      { internalType: "uint256", name: "_hatId", type: "uint256" }
    ],
    name: "isWearerOfHat",
    outputs: [{ internalType: "bool", name: "isWearer", type: "bool" }],
    stateMutability: "view",
    type: "function"
  }
];

export async function debugHatsBalance(walletAddress: string) {
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
  const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
  
  // All Hat IDs to check
  const HAT_IDS_TO_CHECK = {
    'EXECUTIVE_POD_LEADER': process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
    'EXECUTIVE_POD_MEMBER': process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER,
    'DEV_POD_HAT_ID': process.env.NEXT_PUBLIC_DEV_POD_HAT_ID,
    'BOUNTY_MANAGEMENT': process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT,
    'MARKET_MANAGEMENT': process.env.NEXT_PUBLIC_MARKET_MANAGEMENT,
    'EVENT_MANAGEMENT': process.env.NEXT_PUBLIC_EVENT_MANAGEMENT,
    // Also check the hardcoded value from the contract
    'BOUNTY_MANAGER_HAT_182': '182', // From BountyManagerOptimized.sol
    // Common test values
    'TEST_HAT_1': '1',
    'TEST_HAT_100': '100',
    'TEST_HAT_256': '256'
  };

  const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL!));
  const hatsContract = new web3.eth.Contract(HATS_ABI as any, HATS_CONTRACT);

  console.log('🎩 =================================');
  console.log('🎩 HATS PROTOCOL DEBUG REPORT');
  console.log('🎩 =================================');
  console.log('📍 Wallet Address:', walletAddress);
  console.log('📍 Hats Contract:', HATS_CONTRACT);
  console.log('📍 Network:', await web3.eth.getChainId());
  console.log('');

  const results: any = {};

  for (const [name, hatId] of Object.entries(HAT_IDS_TO_CHECK)) {
    if (!hatId) {
      console.log(`⚠️  ${name}: Not configured`);
      continue;
    }

    try {
      console.log(`🔍 Checking ${name}...`);
      console.log(`   Raw Hat ID: ${hatId}`);
      
      // Convert to BigInt for contract call
      let hatIdBigInt: bigint;
      try {
        // Handle both hex and decimal formats
        if (hatId.startsWith('0x')) {
          hatIdBigInt = BigInt(hatId);
        } else {
          hatIdBigInt = BigInt(hatId);
        }
        console.log(`   As BigInt: ${hatIdBigInt.toString()}`);
      } catch (e) {
        console.log(`   ❌ Invalid format: ${e}`);
        continue;
      }

      // Check balance
      const balance = await hatsContract.methods.balanceOf(walletAddress, hatIdBigInt.toString()).call();
      console.log(`   Balance: ${balance}`);

      // Check if hat is active
      try {
        const isActive = await hatsContract.methods.isActive(hatIdBigInt.toString()).call();
        console.log(`   Hat Active: ${isActive}`);
      } catch (e) {
        console.log(`   Hat Active Check Failed: ${e}`);
      }

      // Check if user is wearer
      try {
        const isWearer = await hatsContract.methods.isWearerOfHat(walletAddress, hatIdBigInt.toString()).call();
        console.log(`   Is Wearer: ${isWearer}`);
      } catch (e) {
        console.log(`   Wearer Check Failed: ${e}`);
      }

      results[name] = {
        hatId,
        balance: balance.toString(),
        hasHat: Number(balance) > 0
      };

      console.log(`   ✅ Has Hat: ${Number(balance) > 0}`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      results[name] = {
        hatId,
        error: error.toString()
      };
      console.log('');
    }
  }

  console.log('🎩 =================================');
  console.log('🎩 SUMMARY');
  console.log('🎩 =================================');
  
  const hasAnyHat = Object.values(results).some((r: any) => r.hasHat);
  console.log(`🎯 User has ANY hat: ${hasAnyHat}`);
  
  if (hasAnyHat) {
    console.log('✅ Hats with balance > 0:');
    Object.entries(results).forEach(([name, data]: [string, any]) => {
      if (data.hasHat) {
        console.log(`   - ${name}: ${data.hatId}`);
      }
    });
  } else {
    console.log('⚠️  User has NO hats with balance > 0');
    console.log('');
    console.log('🔧 POSSIBLE ISSUES:');
    console.log('   1. Hat IDs in .env don\'t match deployed hats');
    console.log('   2. User hasn\'t been granted these hats');
    console.log('   3. Hats are inactive or revoked');
    console.log('   4. Wrong network/chain');
  }

  console.log('');
  console.log('🔧 RECOMMENDED FIXES:');
  console.log('   1. Check actual Hat IDs on Base: https://app.hatsprotocol.xyz/');
  console.log('   2. Verify user has been granted the hat');
  console.log('   3. Update .env with correct Hat IDs');
  console.log('   4. Use Hat ID 182 for bounty management (hardcoded in contract)');

  return results;
}

// Function to find what hats a user actually has
export async function findUserHats(walletAddress: string, startId: number = 1, endId: number = 1000) {
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
  const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
  
  const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL!));
  const hatsContract = new web3.eth.Contract(HATS_ABI as any, HATS_CONTRACT);

  console.log(`🔍 Scanning for user's hats from ID ${startId} to ${endId}...`);
  const foundHats: number[] = [];

  for (let hatId = startId; hatId <= endId; hatId++) {
    try {
      const balance = await hatsContract.methods.balanceOf(walletAddress, hatId.toString()).call();
      if (Number(balance) > 0) {
        console.log(`✅ Found Hat #${hatId} with balance: ${balance}`);
        foundHats.push(hatId);
      }
    } catch (error) {
      // Silent fail - just checking
    }
  }

  if (foundHats.length > 0) {
    console.log(`\n🎉 User has ${foundHats.length} hats: ${foundHats.join(', ')}`);
  } else {
    console.log(`\n⚠️ No hats found in range ${startId}-${endId}`);
  }

  return foundHats;
}