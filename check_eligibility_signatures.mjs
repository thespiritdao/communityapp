/**
 * Check Eligibility Module Contract for User Signature
 *
 * The eligibility module IS set on the HAT, but isEligible() returns false.
 * This script checks if the user's signature is recorded in the module.
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const ELIGIBILITY_MODULE_ADDRESS = '0x437e353Ad09cA2fc870bAf19D08AEb08cA81B925';
const MANAGEMENT_HAT_ID = '3666553570037153403039930855960366294036165487385853262297516663111680';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

// Standard Hats Eligibility Module ABI
const ELIGIBILITY_MODULE_ABI = [
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
    name: 'hatToAgreement',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: 'agreement', type: 'string' }]
  },
  {
    name: 'hatToAgreementHash',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: 'hash', type: 'bytes32' }]
  },
  {
    name: 'signatures',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'signer', type: 'address' },
      { name: 'agreementHash', type: 'bytes32' }
    ],
    outputs: [{ name: 'timestamp', type: 'uint256' }]
  },
  {
    name: 'claimerAgreements',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'hatId', type: 'uint256' },
      { name: 'claimer', type: 'address' }
    ],
    outputs: [{ name: 'agreement', type: 'string' }]
  }
];

const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

console.log('🔍 Eligibility Module Signature Check');
console.log('====================================\n');

console.log('Eligibility Module: 0x437e353Ad09cA2fc870bAf19D08AEb08cA81B925');
console.log(`HAT ID: ${MANAGEMENT_HAT_ID}`);
console.log(`User: ${USER_ADDRESS}\n`);

async function checkSignatures() {
  try {
    // 1. Check getWearerStatus (the main check)
    console.log('1️⃣ Checking getWearerStatus...');
    try {
      const wearerStatus = await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'getWearerStatus',
        args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log(`   Eligible: ${wearerStatus[0]}`);
      console.log(`   Standing: ${wearerStatus[1]}\n`);

      if (!wearerStatus[0]) {
        console.log('   ❌ Module reports user is NOT eligible');
        console.log('   This is why isEligible() returns false.\n');
      } else {
        console.log('   ✅ Module reports user IS eligible\n');
      }
    } catch (error) {
      console.log(`   ⚠️ Error calling getWearerStatus: ${error.shortMessage || error.message}\n`);
    }

    // 2. Check agreement hash for this HAT
    console.log('2️⃣ Checking agreement hash for this HAT...');
    try {
      const agreementHash = await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'hatToAgreementHash',
        args: [BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log(`   Agreement Hash: ${agreementHash}\n`);

      if (agreementHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('   ❌ No agreement hash set for this HAT in the module!');
        console.log('   This means the agreement was never registered in the module contract.\n');
        console.log('   Fix: You need to call setAgreement() on the module to register the agreement.\n');
      } else {
        // 3. Check if user has signed this agreement
        console.log('3️⃣ Checking if user signed this agreement...');
        try {
          const signatureTimestamp = await publicClient.readContract({
            address: ELIGIBILITY_MODULE_ADDRESS,
            abi: ELIGIBILITY_MODULE_ABI,
            functionName: 'signatures',
            args: [USER_ADDRESS, agreementHash]
          });

          console.log(`   Signature Timestamp: ${signatureTimestamp}\n`);

          if (signatureTimestamp > 0n) {
            const date = new Date(Number(signatureTimestamp) * 1000);
            console.log(`   ✅ User HAS signed the agreement!`);
            console.log(`   Signed at: ${date.toISOString()}\n`);
            console.log('   🤔 Signature exists but still not eligible. Possible reasons:');
            console.log('   - Module has additional checks beyond signature');
            console.log('   - Signature might be for wrong agreement hash');
            console.log('   - Module might have a cooldown period\n');
          } else {
            console.log(`   ❌ User has NOT signed this agreement in the module!`);
            console.log(`   The signature is not recorded on-chain.\n`);
            console.log('   This is the problem! You need to sign the agreement using the module contract.\n');
            console.log('   Fix: Call signAgreement() on the eligibility module contract.\n');
          }
        } catch (error) {
          console.log(`   ⚠️ Error checking signature: ${error.shortMessage || error.message}\n`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Error getting agreement hash: ${error.shortMessage || error.message}\n`);
    }

    // 4. Try to get the agreement text
    console.log('4️⃣ Trying to read agreement text...');
    try {
      const agreementText = await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'hatToAgreement',
        args: [BigInt(MANAGEMENT_HAT_ID)]
      });

      if (agreementText && agreementText.length > 0) {
        console.log(`   Agreement Text: "${agreementText}"\n`);
      } else {
        console.log(`   No agreement text stored (might use IPFS instead)\n`);
      }
    } catch (error) {
      console.log(`   ⚠️ Cannot read agreement text: ${error.shortMessage || error.message}\n`);
    }

    // 5. Try claimerAgreements
    console.log('5️⃣ Checking claimer-specific agreement...');
    try {
      const claimerAgreement = await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'claimerAgreements',
        args: [BigInt(MANAGEMENT_HAT_ID), USER_ADDRESS]
      });

      if (claimerAgreement && claimerAgreement.length > 0) {
        console.log(`   Claimer Agreement: "${claimerAgreement}"\n`);
      } else {
        console.log(`   No claimer-specific agreement\n`);
      }
    } catch (error) {
      console.log(`   ⚠️ Cannot check claimer agreement: ${error.shortMessage || error.message}\n`);
    }

  } catch (error) {
    console.error('❌ Error during check:', error);
  }
}

console.log('Starting checks...\n');
checkSignatures();
