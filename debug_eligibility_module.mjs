/**
 * Diagnostic Script: Check Eligibility Module Setup
 *
 * This script checks the on-chain state of the eligibility module
 * to understand why isEligible() is returning false.
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const MANAGEMENT_HAT_ID =
  '3666553570037153403039930855960366294036165487385853262297516663111680';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

const HATS_ABI = [
  {
    name: 'isEligible',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'isActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'viewHat',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'eligibility', type: 'address' },
          { name: 'toggle', type: 'address' },
          { name: 'details', type: 'string' },
          { name: 'maxSupply', type: 'uint32' },
          { name: 'supply', type: 'uint32' },
          { name: 'mutable', type: 'bool' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
];

const ELIGIBILITY_MODULE_ABI = [
  {
    name: 'getWearerStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [
      { name: 'eligible', type: 'bool' },
      { name: 'standing', type: 'bool' },
    ],
  },
  {
    name: 'signatures',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'signer', type: 'address' },
      { name: 'agreementHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'timestamp', type: 'uint256' }],
  },
  {
    name: 'agreementHashes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: 'hash', type: 'bytes32' }],
  },
];

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Eligibility Module Diagnostics');
console.log('================================\n');

async function diagnoseEligibilityModule() {
  try {
    // 1. Check if HAT is active
    console.log('1️⃣ Checking HAT active status...');
    const isActive = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_ABI,
      functionName: 'isActive',
      args: [BigInt(MANAGEMENT_HAT_ID)],
    });
    console.log(`   ✅ HAT Active: ${isActive}\n`);

    // 2. Check eligibility (what we see in the component)
    console.log('2️⃣ Checking user eligibility...');
    const isEligible = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_ABI,
      functionName: 'isEligible',
      args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
    });
    console.log(
      `   ${isEligible ? '✅' : '❌'} User Eligible: ${isEligible}\n`,
    );

    // 3. Get HAT details to find eligibility module address
    console.log('3️⃣ Getting HAT details...');
    const hatDetails = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_ABI,
      functionName: 'viewHat',
      args: [BigInt(MANAGEMENT_HAT_ID)],
    });

    console.log('   HAT Details:');
    console.log(`   - Eligibility Module: ${hatDetails.eligibility}`);
    console.log(`   - Toggle Module: ${hatDetails.toggle}`);
    console.log(`   - Max Supply: ${hatDetails.maxSupply}`);
    console.log(`   - Current Supply: ${hatDetails.supply}`);
    console.log(`   - Mutable: ${hatDetails.mutable}`);
    console.log(`   - Active: ${hatDetails.active}\n`);

    const eligibilityModuleAddress = hatDetails.eligibility;

    // 4. Check if eligibility module is set
    if (
      eligibilityModuleAddress === '0x0000000000000000000000000000000000000000'
    ) {
      console.log('   ❌ NO ELIGIBILITY MODULE SET ON HAT');
      console.log(
        '   This is the problem! The HAT has no eligibility module configured.\n',
      );
      console.log(
        '   Solution: You need to sync the eligibility module to the blockchain.',
      );
      return;
    }

    console.log(
      `   ✅ Eligibility module is set: ${eligibilityModuleAddress}\n`,
    );

    // 5. Check eligibility module's view of user status
    console.log('4️⃣ Checking eligibility module status...');
    try {
      const wearerStatus = await publicClient.readContract({
        address: eligibilityModuleAddress,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'getWearerStatus',
        args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
      });

      console.log(`   - Eligible (from module): ${wearerStatus[0]}`);
      console.log(`   - Standing: ${wearerStatus[1]}\n`);

      if (!wearerStatus[0]) {
        console.log('   ❌ Eligibility module says user is NOT eligible');
        console.log('   This means either:');
        console.log('   1. Agreement not signed in the module contract');
        console.log('   2. Signature exists but for wrong agreement hash');
        console.log('   3. Module has additional criteria not met\n');
      }
    } catch (error) {
      console.log(`   ⚠️ Could not call getWearerStatus: ${error.message}`);
      console.log('   This might be a different type of eligibility module\n');
    }

    // 6. Check agreement hash
    console.log('5️⃣ Checking agreement hash...');
    try {
      const agreementHash = await publicClient.readContract({
        address: eligibilityModuleAddress,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'agreementHashes',
        args: [BigInt(MANAGEMENT_HAT_ID)],
      });

      console.log(`   Agreement Hash: ${agreementHash}\n`);

      // 7. Check if user has signed this agreement
      console.log('6️⃣ Checking user signature...');
      const signatureTimestamp = await publicClient.readContract({
        address: eligibilityModuleAddress,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'signatures',
        args: [USER_ADDRESS, agreementHash],
      });

      if (signatureTimestamp > 0n) {
        const date = new Date(Number(signatureTimestamp) * 1000);
        console.log(`   ✅ User HAS signed the agreement!`);
        console.log(`   Signed at: ${date.toISOString()}\n`);
        console.log(
          '   🤔 User has signed but still not eligible. This suggests:',
        );
        console.log('   - The eligibility module might have additional checks');
        console.log('   - There might be a delay in module updating');
        console.log('   - The module might be checking additional criteria\n');
      } else {
        console.log(
          `   ❌ User has NOT signed the agreement in the eligibility module`,
        );
        console.log(`   Signature timestamp: ${signatureTimestamp}\n`);
        console.log(
          '   This is the problem! The signature is not recorded on-chain.',
        );
        console.log(
          '   You need to sign the agreement using the eligibility module contract.\n',
        );
      }
    } catch (error) {
      console.log(`   ⚠️ Could not check agreement: ${error.message}\n`);
    }
  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  }
}

console.log('Pod: Test Pod V2-69');
console.log(`Management HAT ID: ${MANAGEMENT_HAT_ID}`);
console.log(`User Address: ${USER_ADDRESS}\n`);

diagnoseEligibilityModule();
