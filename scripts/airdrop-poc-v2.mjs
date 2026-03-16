#!/usr/bin/env node
/**
 * airdrop-poc-v2.mjs
 *
 * Airdrops ProofOfCuriosityV2 tokens to all registered DAO members.
 * Uses the deployer EOA (AIRDROP_PRIVATE_KEY) directly via viem — not a smart account.
 *
 * Usage:
 *   node scripts/airdrop-poc-v2.mjs            # live run
 *   node scripts/airdrop-poc-v2.mjs --dry-run  # simulate only, no tx sent
 *
 * Required env vars:
 *   AIRDROP_PRIVATE_KEY       — hex private key of the EOA that is an authorizedMinter
 *   POC_V2_CONTRACT_ADDRESS   — deployed ProofOfCuriosityV2 address
 */

import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

const DRY_RUN = process.argv.includes('--dry-run');

const PRIVATE_KEY = process.env.AIRDROP_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.POC_V2_CONTRACT_ADDRESS;

if (!PRIVATE_KEY) {
  console.error('ERROR: AIRDROP_PRIVATE_KEY is not set in .env');
  process.exit(1);
}
if (!CONTRACT_ADDRESS) {
  console.error('ERROR: POC_V2_CONTRACT_ADDRESS is not set in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ABI (minimal)
// ---------------------------------------------------------------------------

const ABI = parseAbi([
  'function batchMint(address[] calldata recipients) external returns (uint256 successCount)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function hasToken(address account) external view returns (bool)',
]);

// ---------------------------------------------------------------------------
// Recipient list — 24 confirmed registered members
// ---------------------------------------------------------------------------

const ALL_RECIPIENTS = [
  '0x8a23bde6b8a1832cd7119daed4a794027d74e71e',
  '0x756ca890351de391ea3646cb354bf4d943a63f6f',
  '0x62421b696132bb635feba0e3cb2f305637cb7ead',
  '0xdfb6614e9de3822e13de08c6b050a448d417b2d6',
  '0x46d6665a4506d9e0519e78dcf7922356df880561',
  '0x02b325d6868b9d53866eb1af9a795a181924204b',
  '0x1df1d0a06f545002bbdd286df67c15a8075ecae1',
  '0x61b32ef6fa936793ef73c01bbc5e244db4b49ce2',
  '0xe3ddfd2b214d51316533181248a4106f83e4934c',
  '0xd0ad866ce9f8200268ffdea6a0550007090814cf',
  '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48',
  '0x19774ac45aa52558967c302f4c11deb60f9ae4c6',
  '0x24833d14dea3fd4a7d5bc269e1be533aab8b37c0',
  '0xaecf4d00f0e402fbeb0757f22be9062d89018106',
  '0x3b2d43b6ceb14bedc590a61bc8e576c5eb635d16',
  '0x21498071d1a52830fa398937a9a8f59c69d3fa7a',
  '0x0259c4b65866d8f9e596052dbcdfc142c28b6329',
  '0xaff63f73347a6cbfa869f6fc5b47f8e0ee676f22',
  '0xd148b96e3e6ff396e4d9acf3946627060e9561a8',
  '0xbe03115945680f518e53c4473e0e077ec7272923',
  '0x40092763d122b7bc91adfcc57211d3cc8d46dbb5',
  '0xa866720839879b4aef18bceb7925d72461a35279',
  '0x0101caccc16fdac093d3a9878a1aa060f5c30bc1',
  '0xd07aba1caeff9843389a8d0da2359287159d2cad',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split an array into chunks of at most `size` elements.
 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== ProofOfCuriosityV2 Airdrop ===');
  console.log(`Contract : ${CONTRACT_ADDRESS}`);
  console.log(`Network  : Base mainnet`);
  console.log(`Mode     : ${DRY_RUN ? 'DRY RUN (no tx will be sent)' : 'LIVE'}`);
  console.log(`Total candidates: ${ALL_RECIPIENTS.length}`);
  console.log('');

  // Build clients
  const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  console.log(`Sender   : ${account.address}`);
  console.log('');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // ---------------------------------------------------------------------------
  // Pre-filter: skip addresses that already hold a token
  // ---------------------------------------------------------------------------

  console.log('Checking existing holders...');

  const skipped = [];
  const toMint = [];

  await Promise.all(
    ALL_RECIPIENTS.map(async (addr) => {
      const holds = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'hasToken',
        args: [addr],
      });
      if (holds) {
        skipped.push(addr);
      } else {
        toMint.push(addr);
      }
    })
  );

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} address(es) that already hold a token:`);
    skipped.forEach((a) => console.log(`  - ${a}`));
  } else {
    console.log('No existing holders found — minting to all candidates.');
  }

  console.log('');
  console.log(`Addresses to mint: ${toMint.length}`);

  if (toMint.length === 0) {
    console.log('Nothing to do — all recipients already hold a token.');
    printSummary(0, skipped.length);
    return;
  }

  if (DRY_RUN) {
    console.log('');
    console.log('[DRY RUN] Would call batchMint with:');
    toMint.forEach((a) => console.log(`  - ${a}`));
    console.log('');
    printSummary(toMint.length, skipped.length, true);
    return;
  }

  // ---------------------------------------------------------------------------
  // Send batches
  // ---------------------------------------------------------------------------

  const batches = chunk(toMint, BATCH_SIZE);
  let totalMinted = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`\nBatch ${b + 1}/${batches.length} — ${batch.length} addresses`);

    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'batchMint',
      args: [batch],
    });

    console.log(`  tx hash : ${txHash}`);
    console.log('  Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  Status  : ${receipt.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  Block   : ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

    if (receipt.status !== 'success') {
      console.error(`  ERROR: Batch ${b + 1} failed! Halting.`);
      process.exit(1);
    }

    totalMinted += batch.length;
  }

  console.log('');
  printSummary(totalMinted, skipped.length);
}

function printSummary(minted, skipped, dryRun = false) {
  console.log('=== Summary ===');
  if (dryRun) {
    console.log(`Would mint : ${minted}`);
    console.log(`Skipped    : ${skipped} (already hold token)`);
  } else {
    console.log(`Minted     : ${minted}`);
    console.log(`Skipped    : ${skipped} (already held token)`);
  }
  console.log('===============');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
