#!/usr/bin/env node
/**
 * airdrop-poc-v2.mjs
 *
 * Airdrops ProofOfCuriosityV2 tokens to all registered DAO members.
 * Calls the existing /api/onboarding/mint-poc route — gasless via CDP Paymaster.
 *
 * Usage:
 *   node scripts/airdrop-poc-v2.mjs            # live run
 *   node scripts/airdrop-poc-v2.mjs --dry-run  # simulate only, no requests sent
 *
 * Required env vars:
 *   NEXT_PUBLIC_APP_URL   — e.g. https://app.spiritdao.org
 *   AIRDROP_API_SECRET    — a secret header value to authorize the batch call
 *                           (optional — remove header check if not needed)
 */

import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.spiritdao.org';
const MINT_ENDPOINT = `${APP_URL}/api/onboarding/mint-poc`;

// Delay between requests to avoid overwhelming the endpoint
const DELAY_MS = 2000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mintOne(walletAddress) {
  const res = await fetch(MINT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  return res.json();
}

async function main() {
  console.log('=== ProofOfCuriosityV2 Airdrop (gasless via CDP Paymaster) ===');
  console.log(`Endpoint : ${MINT_ENDPOINT}`);
  console.log(`Mode     : ${DRY_RUN ? 'DRY RUN (no requests sent)' : 'LIVE'}`);
  console.log(`Total    : ${ALL_RECIPIENTS.length} addresses`);
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY RUN] Would mint to:');
    ALL_RECIPIENTS.forEach((a) => console.log(`  - ${a}`));
    console.log('');
    console.log(`=== DRY RUN complete — ${ALL_RECIPIENTS.length} addresses queued ===`);
    return;
  }

  let minted = 0;
  let alreadyHeld = 0;
  let failed = 0;

  for (let i = 0; i < ALL_RECIPIENTS.length; i++) {
    const addr = ALL_RECIPIENTS[i];
    process.stdout.write(`[${i + 1}/${ALL_RECIPIENTS.length}] ${addr} ... `);

    try {
      const result = await mintOne(addr);

      if (result.alreadyHadToken) {
        console.log('SKIP (already holds token)');
        alreadyHeld++;
      } else if (result.success) {
        console.log(`OK — tx: ${result.transactionHash}`);
        minted++;
      } else {
        console.log(`FAILED — ${result.error}`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      failed++;
    }

    // Small delay between calls to avoid hammering the endpoint
    if (i < ALL_RECIPIENTS.length - 1) await sleep(DELAY_MS);
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Minted      : ${minted}`);
  console.log(`Already held: ${alreadyHeld}`);
  console.log(`Failed      : ${failed}`);
  console.log('===============');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
