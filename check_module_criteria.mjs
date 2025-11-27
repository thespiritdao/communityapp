/**
 * Check what criteria exist in the eligibility module
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const ELIGIBILITY_MODULE_ADDRESS = '0x437e353Ad09cA2fc870bAf19D08AEb08cA81B925';
const MANAGEMENT_HAT_ID = '3666553570037153403039930855960366294036165487385853262297516663111680';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

const MODULE_ABI = [
  {
    name: 'getWearerStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_wearer', type: 'address' },
      { name: '_hatId', type: 'uint256' }
    ],
    outputs: [
      { name: 'eligible', type: 'bool' },
      { name: 'standing', type: 'bool' }
    ]
  },
  {
    name: 'getHatCriteria',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32[]' }]
  },
  {
    name: 'hasSignedAgreement',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_user', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'requireAllCriteria',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  }
];

const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

console.log('🔍 Checking Module Criteria Configuration');
console.log('=========================================\n');

async function checkCriteria() {
  try {
    // 1. Check eligibility status
    console.log('1️⃣ Checking current eligibility status...');
    const status = await publicClient.readContract({
      address: ELIGIBILITY_MODULE_ADDRESS,
      abi: MODULE_ABI,
      functionName: 'getWearerStatus',
      args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log(`   Eligible: ${status[0]}`);
    console.log(`   Standing: ${status[1]}\n`);

    // 2. Get criteria array
    console.log('2️⃣ Checking what criteria are configured...');
    const criteriaHashes = await publicClient.readContract({
      address: ELIGIBILITY_MODULE_ADDRESS,
      abi: MODULE_ABI,
      functionName: 'getHatCriteria',
      args: [BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log(`   Number of criteria: ${criteriaHashes.length}`);

    if (criteriaHashes.length === 0) {
      console.log('   ❌ NO CRITERIA CONFIGURED!');
      console.log('   According to the contract, this should make everyone eligible.');
      console.log('   But getWearerStatus returned false, which is unexpected.\n');
      console.log('   Possible reasons:');
      console.log('   - Wrong HAT ID being checked');
      console.log('   - Contract has a bug');
      console.log('   - Contract version mismatch\n');
    } else {
      console.log(`   ✅ Found ${criteriaHashes.length} criteria:\n`);

      for (let i = 0; i < criteriaHashes.length; i++) {
        console.log(`   Criterion ${i + 1}: ${criteriaHashes[i]}\n`);

        // Try to check if user has signed this agreement hash
        try {
          const hasSigned = await publicClient.readContract({
            address: ELIGIBILITY_MODULE_ADDRESS,
            abi: MODULE_ABI,
            functionName: 'hasSignedAgreement',
            args: [criteriaHashes[i], USER_ADDRESS]
          });

          console.log(`      User has signed: ${hasSigned}`);

          if (!hasSigned) {
            console.log(`      ❌ User has NOT signed this agreement`);
            console.log(`      This is why they're not eligible!\n`);
          } else {
            console.log(`      ✅ User HAS signed this agreement\n`);
          }
        } catch (error) {
          console.log(`      ⚠️ Could not check signature: ${error.shortMessage || error.message}\n`);
        }
      }
    }

    // 3. Check requireAllCriteria setting
    console.log('3️⃣ Checking requireAllCriteria setting...');
    const requireAll = await publicClient.readContract({
      address: ELIGIBILITY_MODULE_ADDRESS,
      abi: MODULE_ABI,
      functionName: 'requireAllCriteria',
      args: [BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log(`   Require ALL criteria: ${requireAll}`);
    console.log(`   (true = must pass all, false = must pass any)\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause.message || error.cause);
    }
  }
}

console.log(`Module Address: ${ELIGIBILITY_MODULE_ADDRESS}`);
console.log(`HAT ID: ${MANAGEMENT_HAT_ID}`);
console.log(`User: ${USER_ADDRESS}\n`);

checkCriteria();
