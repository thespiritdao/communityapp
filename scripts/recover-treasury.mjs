/**
 * Script to recover treasury address from a transaction hash
 * Usage: node scripts/recover-treasury.mjs <txHash>
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const txHash = process.argv[2];

if (!txHash) {
  console.error('❌ Please provide a transaction hash');
  console.log('Usage: node scripts/recover-treasury.mjs <txHash>');
  process.exit(1);
}

console.log('🔍 Fetching receipt for transaction:', txHash);

try {
  const receipt = await publicClient.getTransactionReceipt({
    hash: txHash,
  });

  console.log('\n📦 Transaction Receipt:');
  console.log('Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas Used:', receipt.gasUsed.toString());

  // TreasuryDeployed event signature: keccak256("TreasuryDeployed(string,address,uint256,address[],address)")
  const TREASURY_DEPLOYED_EVENT =
    '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

  console.log('\n🔍 Searching for TreasuryDeployed event...');
  console.log('Total logs:', receipt.logs.length);

  let treasuryAddress = '';

  if (receipt.logs) {
    const deploymentLog = receipt.logs.find(
      (log) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
    );

    if (deploymentLog) {
      console.log('\n✅ Found TreasuryDeployed event!');
      console.log('Topics:', deploymentLog.topics);

      // Treasury address is the second indexed parameter (topics[2])
      const addressFromTopic = deploymentLog.topics?.[2];
      if (addressFromTopic && addressFromTopic.length === 66) {
        treasuryAddress = '0x' + addressFromTopic.slice(-40);
      }
    } else {
      console.log('❌ TreasuryDeployed event not found');
      console.log('\nAll event signatures found:');
      receipt.logs.forEach((log, i) => {
        console.log(`  Log ${i}: ${log.topics?.[0]}`);
      });
    }
  }

  if (treasuryAddress) {
    console.log('\n🏦 Treasury Address:', treasuryAddress);
    console.log('\n✅ Copy this address to update your database!');
  } else {
    console.log('\n❌ Could not extract treasury address from logs');
  }
} catch (error) {
  console.error('❌ Error fetching receipt:', error.message);
  process.exit(1);
}
