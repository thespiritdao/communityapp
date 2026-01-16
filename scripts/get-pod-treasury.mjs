/**
 * Script to get treasury address for a pod from the factory contract
 * Usage: node scripts/get-pod-treasury.mjs <podId>
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const POD_TREASURY_FACTORY = '0xb9e3D01C144c5Bfcd5816afea9190371B0843be6';

// Factory ABI - just the function we need
const FACTORY_ABI = [
  {
    name: 'getTreasury',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
];

const podId = process.argv[2] || '96760362-c7d1-499c-97b0-359333caf228';

console.log('🔍 Querying factory for pod treasury...');
console.log('Factory:', POD_TREASURY_FACTORY);
console.log('Pod ID:', podId);

try {
  const treasuryAddress = await publicClient.readContract({
    address: POD_TREASURY_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getTreasury',
    args: [podId],
  });

  console.log('\n✅ Treasury Address:', treasuryAddress);

  if (treasuryAddress === '0x0000000000000000000000000000000000000000') {
    console.log('⚠️  Zero address - treasury may not be deployed yet');
  } else {
    console.log('\n🎉 Treasury found! Update your database with this address.');
  }
} catch (error) {
  console.error('❌ Error querying factory:', error.message);

  // Try alternative function name
  console.log('\n🔄 Trying alternative function name...');

  const ALT_ABI = [
    {
      name: 'podTreasuries',
      type: 'function',
      inputs: [{ name: 'podId', type: 'string' }],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
    },
  ];

  try {
    const treasuryAddress = await publicClient.readContract({
      address: POD_TREASURY_FACTORY,
      abi: ALT_ABI,
      functionName: 'podTreasuries',
      args: [podId],
    });

    console.log('\n✅ Treasury Address:', treasuryAddress);

    if (treasuryAddress === '0x0000000000000000000000000000000000000000') {
      console.log('⚠️  Zero address - treasury may not be deployed yet');
    } else {
      console.log('\n🎉 Treasury found! Update your database with this address.');
    }
  } catch (altError) {
    console.error('❌ Alternative query also failed:', altError.message);
  }
}
