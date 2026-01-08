/**
 * Check Beta Tester HAT Holders
 *
 * Queries the Hats Protocol contract to find all holders of the Beta Tester HAT.
 *
 * Usage:
 *   npx ts-node scripts/check-beta-tester-holders.ts
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT as `0x${string}`;

const HATS_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function isWearerOfHat(address user, uint256 hatId) external view returns (bool)',
  'function hatSupply(uint256 hatId) external view returns (uint32)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
]);

async function main() {
  console.log('🔍 Checking Beta Tester HAT holders...\n');

  if (!BETA_TESTER_HAT) {
    console.error('❌ NEXT_PUBLIC_BETA_TESTER_HAT not configured in .env.local');
    process.exit(1);
  }

  console.log(`🎩 Beta Tester HAT ID: ${BETA_TESTER_HAT}`);

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  // Check current supply
  const supply = await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS,
    abi: HATS_ABI,
    functionName: 'hatSupply',
    args: [BigInt(BETA_TESTER_HAT)],
  });

  console.log(`📊 Current supply: ${supply} holders\n`);

  if (supply === 0) {
    console.log('ℹ️ No Beta Tester HATs have been minted yet.');
    console.log('\nTo mint a Beta Tester HAT:');
    console.log('1. Complete onboarding at /landing');
    console.log('2. Or manually mint via /api/onboarding/mint-hat');
    process.exit(0);
  }

  // Get TransferSingle events to find holders
  console.log('🔎 Scanning blockchain for HAT transfer events...\n');

  // Query last 100,000 blocks for transfers (~1-2 months on Base)
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock - 100000n;

  console.log(`📦 Scanning blocks ${fromBlock} to ${currentBlock}...\n`);

  const logs = await publicClient.getLogs({
    address: HATS_PROTOCOL_ADDRESS,
    event: {
      type: 'event',
      name: 'TransferSingle',
      inputs: [
        { type: 'address', indexed: true, name: 'operator' },
        { type: 'address', indexed: true, name: 'from' },
        { type: 'address', indexed: true, name: 'to' },
        { type: 'uint256', indexed: false, name: 'id' },
        { type: 'uint256', indexed: false, name: 'value' },
      ],
    },
    fromBlock,
    toBlock: 'latest',
  });

  // Filter for Beta Tester HAT transfers only
  const betaTesterLogs = logs.filter((log) => {
    const id = log.args.id as bigint;
    return id === BigInt(BETA_TESTER_HAT);
  });

  console.log(`📋 Found ${betaTesterLogs.length} transfer events for Beta Tester HAT\n`);

  if (betaTesterLogs.length === 0) {
    console.log('⚠️ No transfer events found in recent blocks.');
    console.log('The HAT may have been minted earlier. Try increasing the block range.');
    process.exit(0);
  }

  // Extract unique recipients (to addresses that aren't zero address)
  const recipients = new Set<string>();

  for (const log of betaTesterLogs) {
    const to = log.args.to as string;
    const from = log.args.from as string;
    const value = log.args.value as bigint;

    // Minting: from = 0x0000...
    // Transfer: from != 0x0000...
    // Burning: to = 0x0000...

    if (value > 0n && to !== '0x0000000000000000000000000000000000000000') {
      recipients.add(to.toLowerCase());
    }
  }

  console.log('👥 Potential holders found:');
  console.log('─'.repeat(70));

  const holders: string[] = [];

  for (const address of Array.from(recipients)) {
    // Verify they still hold the HAT
    const isWearer = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [address as `0x${string}`, BigInt(BETA_TESTER_HAT)],
    });

    if (isWearer) {
      holders.push(address);
      console.log(`✅ ${address}`);
    } else {
      console.log(`❌ ${address} (no longer wearing HAT)`);
    }
  }

  console.log('─'.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   Total supply: ${supply}`);
  console.log(`   Current holders: ${holders.length}`);

  if (holders.length === 0) {
    console.log('\n⚠️ No current holders found.');
    console.log('   HATs may have been revoked or burned.');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
