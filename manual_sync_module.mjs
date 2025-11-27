/**
 * Manual Module Sync Script
 *
 * This script manually calls addAgreementCriterion() on the eligibility module
 * to register the agreement requirement, bypassing the UI lockout.
 *
 * Run with: node manual_sync_module.mjs
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex, encodeBytes32String } from 'viem';

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const ELIGIBILITY_MODULE_ADDRESS = '0x437e353Ad09cA2fc870bAf19D08AEb08cA81B925';
const MANAGEMENT_HAT_ID = '3666553570037153594601873464196473588829543881174501214639906936061952';

// Your agreement CID (from IPFS)
// TODO: Get this from your database or from the agreement creation
const AGREEMENT_CID = 'YOUR_AGREEMENT_CID_HERE';  // ← REPLACE THIS

// Your private key (keep this secure!)
// You can also use process.env.PRIVATE_KEY
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';  // ← REPLACE THIS

// Whether all criteria must be met (true) or any (false)
const REQUIRE_ALL = true;

// ============================================================================
// CONTRACT ABI
// ============================================================================

const ELIGIBILITY_MODULE_ABI = [
  {
    name: 'addAgreementCriterion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_requireAll', type: 'bool' }
    ],
    outputs: []
  },
  {
    name: 'getHatCriteria',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32[]' }]
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  console.log('🔧 Manual Module Sync Script');
  console.log('============================\n');

  // Validate configuration
  if (AGREEMENT_CID === 'YOUR_AGREEMENT_CID_HERE') {
    console.error('❌ ERROR: Please set AGREEMENT_CID in the script');
    console.log('\nTo get your agreement CID:');
    console.log('1. Run this query in Supabase SQL editor:');
    console.log(`
    SELECT
      id, pod_id, role_type,
      agreement_text, agreement_cid, agreement_hash
    FROM pod_eligibility_agreements
    WHERE pod_id = '02743d5e-aacd-4301-ab23-d11e080abaa1'
      AND role_type = 'leader';
    `);
    console.log('2. Copy the agreement_cid value');
    console.log('3. Update AGREEMENT_CID in this script\n');
    process.exit(1);
  }

  if (PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
    console.error('❌ ERROR: Please set PRIVATE_KEY');
    console.log('\nOption 1: Set environment variable:');
    console.log('  export PRIVATE_KEY=0x...');
    console.log('  node manual_sync_module.mjs\n');
    console.log('Option 2: Update PRIVATE_KEY in the script (not recommended)\n');
    process.exit(1);
  }

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  console.log('📋 Configuration:');
  console.log(`   Module Address: ${ELIGIBILITY_MODULE_ADDRESS}`);
  console.log(`   HAT ID: ${MANAGEMENT_HAT_ID}`);
  console.log(`   Agreement CID: ${AGREEMENT_CID}`);
  console.log(`   Your Address: ${account.address}`);
  console.log(`   Require All: ${REQUIRE_ALL}\n`);

  // Calculate agreement hash from CID
  const agreementHash = keccak256(toHex(AGREEMENT_CID));
  console.log(`📝 Agreement Hash: ${agreementHash}\n`);

  // Check current criteria
  console.log('1️⃣ Checking current module criteria...');
  try {
    const currentCriteria = await publicClient.readContract({
      address: ELIGIBILITY_MODULE_ADDRESS,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'getHatCriteria',
      args: [BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log(`   Current criteria count: ${currentCriteria.length}`);

    if (currentCriteria.length > 0) {
      console.log('   Existing criteria:');
      currentCriteria.forEach((hash, i) => {
        console.log(`     ${i + 1}. ${hash}`);
      });

      // Check if our hash is already there
      if (currentCriteria.includes(agreementHash)) {
        console.log('\n✅ Agreement criterion already registered!');
        console.log('   The module already knows about this agreement.');
        console.log('   Your issue might be something else.\n');
        return;
      }
    }
  } catch (error) {
    console.log(`   ⚠️ Could not read criteria: ${error.message}`);
  }

  console.log('\n2️⃣ Adding agreement criterion to module...');

  try {
    // Call addAgreementCriterion
    const hash = await walletClient.writeContract({
      address: ELIGIBILITY_MODULE_ADDRESS,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'addAgreementCriterion',
      args: [BigInt(MANAGEMENT_HAT_ID), agreementHash, REQUIRE_ALL]
    });

    console.log(`   ⏳ Transaction submitted: ${hash}`);
    console.log('   Waiting for confirmation...\n');

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ SUCCESS! Agreement criterion added to module!\n');
      console.log(`   Transaction: https://basescan.org/tx/${hash}\n`);

      // Verify it was added
      console.log('3️⃣ Verifying criterion was added...');
      const updatedCriteria = await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'getHatCriteria',
        args: [BigInt(MANAGEMENT_HAT_ID)]
      });

      console.log(`   ✅ Updated criteria count: ${updatedCriteria.length}`);
      console.log('   Criteria hashes:');
      updatedCriteria.forEach((hash, i) => {
        const isNew = hash === agreementHash;
        console.log(`     ${i + 1}. ${hash} ${isNew ? '← NEW!' : ''}`);
      });

      console.log('\n✅ Module sync complete!');
      console.log('\nNext steps:');
      console.log('1. Refresh your pod management page');
      console.log('2. Check console for: isEligible: true');
      console.log('3. Click "Claim Management HAT" button\n');

    } else {
      console.error('❌ Transaction failed!');
      console.log(`   Receipt: ${JSON.stringify(receipt, null, 2)}\n`);
    }

  } catch (error) {
    console.error('❌ Error adding criterion:', error.message);

    if (error.message.includes('insufficient funds')) {
      console.log('\n💡 Your wallet needs ETH on Base to pay for gas.');
    } else if (error.message.includes('not authorized') || error.message.includes('Ownable')) {
      console.log('\n💡 Your address is not authorized to modify this module.');
      console.log('   Only the HAT admin can add criteria.');
      console.log(`   Your address: ${account.address}`);
    }

    console.log('');
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
