/**
 * Quick diagnostic script to check Advocate NFT balance
 */

import dotenv from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const ADVOCATE_ADDRESS = '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d';
const TEST_WALLET = '0xAECF4D00F0e402FbeB0757f22be9062d89018106';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const ADVOCATE_ABI = parseAbi([
  'function balanceOf(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function totalSupply() external view returns (uint256)',
]);

async function main() {
  console.log('🔍 Checking Advocate NFT Balance...\n');
  console.log(`Contract: ${ADVOCATE_ADDRESS}`);
  console.log(`Wallet: ${TEST_WALLET}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    // Get contract info
    const [name, symbol, totalSupply] = await Promise.all([
      publicClient.readContract({
        address: ADVOCATE_ADDRESS as `0x${string}`,
        abi: ADVOCATE_ABI,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: ADVOCATE_ADDRESS as `0x${string}`,
        abi: ADVOCATE_ABI,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: ADVOCATE_ADDRESS as `0x${string}`,
        abi: ADVOCATE_ABI,
        functionName: 'totalSupply',
      }),
    ]);

    console.log('📜 Contract Info:');
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Total Supply: ${totalSupply}\n`);

    // Check balance
    const balance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS as `0x${string}`,
      abi: ADVOCATE_ABI,
      functionName: 'balanceOf',
      args: [TEST_WALLET as `0x${string}`],
    });

    console.log('💰 Balance Check:');
    console.log(`   Balance: ${balance}`);

    if (balance > 0n) {
      console.log(`   ✅ User HAS ${balance} Advocate NFT(s)`);
    } else {
      console.log(`   ❌ User has NO Advocate NFTs`);
    }

  } catch (error) {
    console.error('\n❌ Error checking balance:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }
}

main()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
