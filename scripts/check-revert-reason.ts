/**
 * Check actual revert reason from failed transactions
 */
import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const FAILED_TXS = [
  '0x0d462efc8d6e07eafbf1657b8939ec8c8290486127cf10ee4c58237f6b794a7d', // Eric Miki
  '0xadf81d16146ba85fdef332327bdf2621afcb6b19c2218e44c0c64f449c42f84a', // Mariah McKay
  '0xbe9bb73ccf416ff631d4fe2932e822ec9b6da7acb9f2464c03d22a8f828604d0', // Tressa Rivers
  '0x8e206bdcc6ed486e29de930762c4cf7b6e232a77742bd80008fca38cdc63cf40', // René Pinnell
  '0x1b5bd68ef59eabef4ced89e43aa597cfef09c361624b6f43f73108bbc049bd62', // Ron Rivers #2
];

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('🔍 Checking Revert Reasons\n');

  for (const txHash of FAILED_TXS) {
    console.log(`\nTx: ${txHash}`);

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      console.log(`  Status: ${receipt.status}`);
      console.log(`  Gas Used: ${receipt.gasUsed}`);

      if (receipt.status === 'reverted') {
        // Try to get the transaction and simulate it to get revert reason
        const tx = await publicClient.getTransaction({
          hash: txHash as `0x${string}`,
        });

        try {
          await publicClient.call({
            to: tx.to,
            data: tx.input,
            from: tx.from,
            value: tx.value,
            blockNumber: receipt.blockNumber - 1n,
          });
        } catch (error: any) {
          console.log(`  Revert Reason: ${error.shortMessage || error.message}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Error fetching tx: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
