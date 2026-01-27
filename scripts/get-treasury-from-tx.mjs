#!/usr/bin/env node
/**
 * Extract treasury address from deployment transaction
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const TX_HASH = '0x9a658057729dfdc7b7be63db3a227bf8b493c36fc396b52de05f42f885217550';

async function extractTreasuryAddress() {
  console.log('🔍 Fetching transaction receipt...\n');
  console.log('Transaction:', TX_HASH);
  console.log('');

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: TX_HASH,
    });

    console.log('✅ Transaction found!');
    console.log('   Status:', receipt.status === 'success' ? '✅ SUCCESS' : '❌ FAILED');
    console.log('   Block:', receipt.blockNumber);
    console.log('   Gas Used:', receipt.gasUsed.toString());
    console.log('');

    if (receipt.status !== 'success') {
      console.log('❌ Transaction failed - no treasury deployed');
      return;
    }

    // Look for TreasuryDeployed event
    // Factory emits: event TreasuryDeployed(string indexed podId, address treasuryAddress, uint256 managementHatId);
    const treasuryDeployedEvent = receipt.logs.find(log => {
      // Check if this is a TreasuryDeployed event (topics[0] is event signature)
      return log.topics[0] === '0x' + 'TreasuryDeployed'.split('').map(c => c.charCodeAt(0).toString(16)).join('');
    });

    if (!treasuryDeployedEvent) {
      console.log('⚠️ TreasuryDeployed event not found in logs');
      console.log('📋 All logs:', receipt.logs.length, 'log entries');
      console.log('');

      // Look for contract creation (might be from factory)
      const contractCreations = receipt.logs.filter(log => log.address && log.topics.length > 0);
      if (contractCreations.length > 0) {
        console.log('📦 Possible treasury address (from logs):');
        // The treasury address is usually in the logs as the 'address' field
        const uniqueAddresses = [...new Set(receipt.logs.map(l => l.address))];
        uniqueAddresses.forEach(addr => {
          if (addr !== receipt.to) { // Exclude factory address
            console.log('   🏦', addr);
          }
        });
      }
    } else {
      console.log('✅ TreasuryDeployed event found!');
      // Parse the treasury address from event data
      console.log('🏦 Treasury Address:', treasuryDeployedEvent.address);
    }

    console.log('');
    console.log('🔗 View on BaseScan: https://basescan.org/tx/' + TX_HASH);

  } catch (error) {
    console.error('❌ Error fetching transaction:', error.message);
  }
}

extractTreasuryAddress();
