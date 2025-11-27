/**
 * Verify Toggle Module Implementation
 *
 * This script verifies that:
 * 1. The proxy has getHatStatus() function
 * 2. The proxy returns true for admin HAT status
 * 3. The proxy is recognized as wearing the admin HAT
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

// ABI for proxy with toggle implementation
const PROXY_ABI = [
  {
    name: 'getHatStatus',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'proxyAdminHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }
];

const HATS_ABI = [
  {
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  }
];

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL)
});

async function verifyToggleImplementation(proxyAddress) {
  console.log('\n🔍 VERIFYING TOGGLE MODULE IMPLEMENTATION\n');
  console.log('Proxy Address:', proxyAddress);
  console.log('Hats Protocol:', HATS_PROTOCOL);
  console.log('='.repeat(60));

  try {
    // Step 1: Check if proxy has admin HAT ID set
    console.log('\n1️⃣  Checking proxy admin HAT ID...');
    const adminHatId = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'proxyAdminHatId'
    });
    console.log('   ✅ Admin HAT ID:', adminHatId.toString());

    if (adminHatId === 0n) {
      console.log('   ❌ Admin HAT ID is 0 - pod needs migration or Phase 5 incomplete');
      return false;
    }

    // Step 2: Check if pod is active
    console.log('\n2️⃣  Checking pod active status...');
    const isActive = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'isActive'
    });
    console.log('   ✅ Pod Active:', isActive);

    if (!isActive) {
      console.log('   ⚠️  Pod is not active - this may affect HAT status');
    }

    // Step 3: Check getHatStatus() function
    console.log('\n3️⃣  Testing getHatStatus() function...');
    try {
      const hatStatus = await client.readContract({
        address: proxyAddress,
        abi: PROXY_ABI,
        functionName: 'getHatStatus',
        args: [adminHatId]
      });
      console.log('   ✅ getHatStatus() returned:', hatStatus);
      console.log('   ✅ Function exists and is callable!');

      if (hatStatus !== isActive) {
        console.log('   ⚠️  WARNING: getHatStatus() returned', hatStatus, 'but pod isActive is', isActive);
        console.log('   ⚠️  Expected them to match for admin HAT!');
      }
    } catch (error) {
      console.log('   ❌ getHatStatus() call failed:', error.message);
      console.log('   ❌ This means the toggle interface is NOT implemented!');
      return false;
    }

    // Step 4: Check if Hats Protocol recognizes proxy as wearer
    console.log('\n4️⃣  Checking if Hats Protocol recognizes proxy as admin HAT wearer...');
    const isWearer = await client.readContract({
      address: HATS_PROTOCOL,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [proxyAddress, adminHatId]
    });
    console.log('   ✅ isWearerOfHat() returned:', isWearer);

    if (!isWearer) {
      console.log('   ❌ Proxy is NOT recognized as wearing admin HAT!');
      console.log('   Possible causes:');
      console.log('   - HAT was not minted to proxy (check Phase 5)');
      console.log('   - getHatStatus() returned false');
      console.log('   - HAT has been revoked or burned');
      return false;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL CHECKS PASSED!');
    console.log('✅ Toggle module implementation is working correctly!');
    console.log('='.repeat(60) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
    return false;
  }
}

// Get proxy address from command line or .env
const proxyAddress = process.argv[2];

if (!proxyAddress) {
  console.error('\n❌ Usage: node verify_toggle_implementation.js <PROXY_ADDRESS>');
  console.error('Example: node verify_toggle_implementation.js 0x123...\n');
  process.exit(1);
}

verifyToggleImplementation(proxyAddress)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
