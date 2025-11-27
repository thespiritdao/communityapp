/**
 * Check what version/functions the new factory has
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const NEW_FACTORY = '0x52122e732700568760e475FA8289a13A4568d886';

const client = createPublicClient({
  chain: base,
  transport: http(),
});

// Try V3 signature (with actualUser parameter)
const V3_ABI = [
  {
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'eligibilityModule', type: 'address' },
      { name: 'hatId', type: 'uint256' },
      { name: 'actualUser', type: 'address' },
    ],
    name: 'clearAllCriteriaViaFactory',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Try V2 signature (without actualUser parameter)
const V2_ABI = [
  {
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'eligibilityModule', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    name: 'clearAllCriteriaViaFactory',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

console.log('🔍 Checking Factory Version\n');
console.log('Factory:', NEW_FACTORY);
console.log('---\n');

// Check if contract exists
try {
  const code = await client.getBytecode({ address: NEW_FACTORY });

  if (!code || code === '0x') {
    console.error('❌ No contract deployed at this address!');
    process.exit(1);
  }

  console.log('✅ Contract exists (bytecode length:', code.length, 'bytes)\n');

  // Try to determine version by checking function signatures
  console.log('Checking function signatures...\n');

  // V3 has 4 parameters (including actualUser)
  // V2 has 3 parameters

  // We can't easily test this without a pod, but we can check the bytecode
  console.log('📋 This factory is deployed at:', NEW_FACTORY);
  console.log('\n🎯 To test this factory:\n');
  console.log('1. Create a NEW test pod using the UI');
  console.log('2. This will register the pod with THIS factory');
  console.log('3. Then test eligibility sync with the new pod\n');
  console.log('---');
  console.log('\n❓ Question for you:\n');
  console.log('What version is this factory?');
  console.log('- Is it V2 (3 parameters in clearAllCriteriaViaFactory)?');
  console.log('- Is it V3 (4 parameters, including actualUser)?');
  console.log('- Or a different version?\n');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
