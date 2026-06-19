/**
 * Advance the global $SELF epoch / quarter (Exec, quarterly).
 *
 * Calls SelfEpochs.advanceEpoch() — EPOCH_ADMIN_ROLE only (the admin wallet
 * 0xd481…). IRREVERSIBLE: advancing the epoch moves the expiry window forward;
 * $SELF earned K epochs ago becomes expired. Run deliberately at quarter close.
 *
 * Requires a CONFIRM=yes guard to prevent accidental double-advance.
 *
 * Usage:
 *   CONFIRM=yes node scripts/advance-self-epoch.mjs
 *
 * Signs with the EPOCH_ADMIN key. By default uses ADMIN_EPOCH_PRIVATE_KEY; the
 * admin wallet 0xd481… must hold EPOCH_ADMIN_ROLE on SelfEpochs (it does — set
 * at deploy). This is an admin op, not a user op, so it pays its own gas.
 */
import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

function fail(msg) { console.error('❌', msg); process.exit(1); }

if (process.env.CONFIRM !== 'yes') {
  fail('Refusing to advance without CONFIRM=yes. This is IRREVERSIBLE (expires older $SELF).');
}

const SELF_EPOCHS = process.env.NEXT_PUBLIC_SELF_EPOCHS;
const KEY = process.env.ADMIN_EPOCH_PRIVATE_KEY; // EPOCH_ADMIN holder (0xd481…)
const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

if (!SELF_EPOCHS) fail('NEXT_PUBLIC_SELF_EPOCHS not set');
if (!KEY) fail('ADMIN_EPOCH_PRIVATE_KEY not set (must be the EPOCH_ADMIN wallet)');

const ABI = parseAbi([
  'function currentEpoch() view returns (uint32)',
  'function lifetimeEpochs() view returns (uint32)',
  'function advanceEpoch() external',
]);

const account = privateKeyToAccount(KEY.startsWith('0x') ? KEY : `0x${KEY}`);
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

const before = await pub.readContract({ address: SELF_EPOCHS, abi: ABI, functionName: 'currentEpoch' });
const k = await pub.readContract({ address: SELF_EPOCHS, abi: ABI, functionName: 'lifetimeEpochs' });
console.log(`Current epoch: ${before} · lifetime K: ${k}`);
console.log(`Advancing to epoch ${Number(before) + 1} (signer ${account.address})…`);

const hash = await wallet.writeContract({ address: SELF_EPOCHS, abi: ABI, functionName: 'advanceEpoch' });
console.log(`tx: ${hash}  — waiting…`);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') fail(`Reverted: ${hash}`);

const after = await pub.readContract({ address: SELF_EPOCHS, abi: ABI, functionName: 'currentEpoch' });
console.log(`✅ Epoch advanced: ${before} → ${after}`);
console.log(`   $SELF earned in epoch ${Number(after) - Number(k)} and earlier is now expired.`);
