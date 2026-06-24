/**
 * Read-only verification of the $SELF DECAY CUTOVER (V2) deploy.
 * Companion to docs/runbook-self-decay-deploy.md (Step 6).
 *
 * Reads V2 addresses from .env (NEXT_PUBLIC_SELF_*) so it always checks the
 * live set. Verifies:
 *   1. Role wiring (MINTER/BURNER/ATTESTOR/EPOCH_ADMIN/receipt MINTER + admin).
 *   2. Immutable pointers — SelfMinterV2.selfEpochs and SelfPaymentV2.selfEpochs
 *      / .selfReceipt actually point at the V2 Epochs (proves no stale wiring).
 *   3. Decay is live — currentEpoch + decayHorizon match the constructor
 *      (epoch 0, horizon 8) and decayFactorBps math is correct.
 *
 * Run: node scripts/verify-self-roles-v2.mjs
 */
import 'dotenv/config';
import { createPublicClient, http, keccak256, toBytes, getAddress } from 'viem';
import { base } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const client = createPublicClient({ chain: base, transport: http(RPC) });

const A = {
  EPOCHS: getAddress(process.env.NEXT_PUBLIC_SELF_EPOCHS),
  RECEIPT: getAddress(process.env.NEXT_PUBLIC_SELF_RECEIPT),
  PRESTIGE: getAddress(process.env.NEXT_PUBLIC_SELF_PRESTIGE),
  MINTER: getAddress(process.env.NEXT_PUBLIC_SELF_MINTER),
  PAYMENT: getAddress(process.env.NEXT_PUBLIC_SELF_PAYMENT),
  ADMIN: '0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d',
  POD_ADMIN: '0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF',
  SMART: '0x05c06af9fe1a996144902D9571d1d2783866cF63',
};

const role = (name) =>
  name === 'DEFAULT_ADMIN_ROLE'
    ? '0x0000000000000000000000000000000000000000000000000000000000000000'
    : keccak256(toBytes(name));

const HAS_ROLE_ABI = [{
  name: 'hasRole', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
  outputs: [{ type: 'bool' }],
}];

const ADDR_VIEW = (name) => [{
  name, type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }],
}];
const UINT_VIEW = (name, t) => [{
  name, type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: t }],
}];
const DECAY_ABI = [{
  name: 'decayFactorBps', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }],
}];
const ENCODE_ABI = [{
  name: 'encodeId', type: 'function', stateMutability: 'pure',
  inputs: [{ name: 'communityId', type: 'uint224' }, { name: 'epoch', type: 'uint32' }],
  outputs: [{ type: 'uint256' }],
}];

// [contract, roleName, account, expected, label]
const CHECKS = [
  [A.EPOCHS, 'MINTER_ROLE', A.MINTER, true, 'EpochsV2 MINTER → MinterV2'],
  [A.EPOCHS, 'BURNER_ROLE', A.PAYMENT, true, 'EpochsV2 BURNER → PaymentV2'],
  [A.RECEIPT, 'MINTER_ROLE', A.PAYMENT, true, 'Receipt MINTER → PaymentV2'],
  [A.MINTER, 'ATTESTOR_ROLE', A.SMART, true, 'MinterV2 ATTESTOR → backend SMART wallet'],
  [A.EPOCHS, 'EPOCH_ADMIN_ROLE', A.SMART, true, 'EpochsV2 EPOCH_ADMIN → SMART (in-app advance)'],
  [A.EPOCHS, 'EPOCH_ADMIN_ROLE', A.ADMIN, true, 'EpochsV2 EPOCH_ADMIN → 0xd481 (backup)'],
  [A.PRESTIGE, 'JANITOR_ROLE', A.SMART, true, 'Prestige JANITOR → SMART (unchanged)'],
  [A.RECEIPT, 'FULFILLER_ROLE', A.SMART, true, 'Receipt FULFILLER → SMART (unchanged)'],
  // Admin retained
  [A.EPOCHS, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'EpochsV2 admin → 0xd481'],
  [A.MINTER, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'MinterV2 admin → 0xd481'],
  [A.PAYMENT, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'PaymentV2 admin → 0xd481'],
  // Stray grants that must NOT be present
  [A.RECEIPT, 'MINTER_ROLE', A.MINTER, false, 'Receipt MINTER must NOT be Minter (the slip)'],
  [A.EPOCHS, 'LOCKER_ROLE', A.POD_ADMIN, false, 'EpochsV2 LOCKER unset (staking seam)'],
];

async function checkRoles() {
  console.log('— Role wiring —');
  let pass = 0, fail = 0;
  for (const [addr, roleName, account, expected, label] of CHECKS) {
    let actual;
    try {
      actual = await client.readContract({
        address: getAddress(addr), abi: HAS_ROLE_ABI,
        functionName: 'hasRole', args: [role(roleName), getAddress(account)],
      });
    } catch (e) {
      console.log(`⚠️  ${label} — read failed: ${e.shortMessage || e.message?.slice(0, 60)}`);
      fail++; continue;
    }
    const ok = actual === expected;
    console.log(`${ok ? '✅' : '❌'} ${label}  (hasRole=${actual}, expected=${expected})`);
    ok ? pass++ : fail++;
  }
  return { pass, fail };
}

async function checkPointers() {
  console.log('\n— Immutable pointers (redeployed contracts point at V2 Epochs) —');
  let pass = 0, fail = 0;
  const reads = [
    [A.MINTER, 'selfEpochs', A.EPOCHS, 'MinterV2.selfEpochs → EpochsV2'],
    [A.PAYMENT, 'selfEpochs', A.EPOCHS, 'PaymentV2.selfEpochs → EpochsV2'],
    [A.PAYMENT, 'selfReceipt', A.RECEIPT, 'PaymentV2.selfReceipt → Receipt (kept)'],
  ];
  for (const [addr, fn, expected, label] of reads) {
    let actual;
    try {
      actual = await client.readContract({ address: addr, abi: ADDR_VIEW(fn), functionName: fn });
    } catch (e) {
      console.log(`⚠️  ${label} — read failed: ${e.shortMessage || e.message?.slice(0, 60)}`);
      fail++; continue;
    }
    const ok = getAddress(actual) === getAddress(expected);
    console.log(`${ok ? '✅' : '❌'} ${label}  (got=${actual})`);
    ok ? pass++ : fail++;
  }
  return { pass, fail };
}

async function checkDecay() {
  console.log('\n— Decay state (constructor took: epoch 0, horizon 8) —');
  let pass = 0, fail = 0;
  let currentEpoch, horizon;
  try {
    currentEpoch = await client.readContract({ address: A.EPOCHS, abi: UINT_VIEW('currentEpoch', 'uint32'), functionName: 'currentEpoch' });
    horizon = await client.readContract({ address: A.EPOCHS, abi: UINT_VIEW('decayHorizon', 'uint32'), functionName: 'decayHorizon' });
  } catch (e) {
    console.log(`⚠️  could not read epoch/horizon: ${e.shortMessage || e.message?.slice(0, 80)}`);
    return { pass: 0, fail: 1 };
  }
  const hOk = Number(horizon) === 8;
  console.log(`${hOk ? '✅' : '⚠️ '} decayHorizon = ${horizon} (expected 8 from runbook)`);
  hOk ? pass++ : fail++;
  console.log(`ℹ️  currentEpoch = ${currentEpoch}`);

  // Prove decay math is live: id at currentEpoch → full (10000 bps); id one epoch
  // older → BPS - BPS/horizon; id horizon-or-more older → 0.
  try {
    const community = 1n; // arbitrary sample community id
    const idNow = await client.readContract({ address: A.EPOCHS, abi: ENCODE_ABI, functionName: 'encodeId', args: [community, Number(currentEpoch)] });
    const fNow = await client.readContract({ address: A.EPOCHS, abi: DECAY_ABI, functionName: 'decayFactorBps', args: [idNow] });
    const nowOk = fNow === 10000n;
    console.log(`${nowOk ? '✅' : '❌'} decayFactorBps(currentEpoch) = ${fNow} bps (expected 10000 = 100%)`);
    nowOk ? pass++ : fail++;

    if (Number(currentEpoch) >= 1) {
      const idOld = await client.readContract({ address: A.EPOCHS, abi: ENCODE_ABI, functionName: 'encodeId', args: [community, Number(currentEpoch) - 1] });
      const fOld = await client.readContract({ address: A.EPOCHS, abi: DECAY_ABI, functionName: 'decayFactorBps', args: [idOld] });
      const expected = 10000n - (10000n / BigInt(horizon));
      const oldOk = fOld === expected;
      console.log(`${oldOk ? '✅' : '❌'} decayFactorBps(currentEpoch-1) = ${fOld} bps (expected ${expected} = 1 epoch of decay)`);
      oldOk ? pass++ : fail++;
    } else {
      console.log(`ℹ️  currentEpoch is 0 — cannot sample an aged id yet (advance an epoch to see decay drop). Math verified at full value only.`);
    }
  } catch (e) {
    console.log(`⚠️  decay math read failed: ${e.shortMessage || e.message?.slice(0, 80)}`);
    fail++;
  }
  return { pass, fail };
}

async function main() {
  console.log('\n=== $SELF V2 (Decay) Deploy Verification ===');
  console.log('RPC:', RPC);
  console.log('EpochsV2 :', A.EPOCHS);
  console.log('MinterV2 :', A.MINTER);
  console.log('PaymentV2:', A.PAYMENT);
  console.log('Receipt  :', A.RECEIPT, '(kept)');
  console.log('Prestige :', A.PRESTIGE, '(kept)\n');

  const r1 = await checkRoles();
  const r2 = await checkPointers();
  const r3 = await checkDecay();

  const pass = r1.pass + r2.pass + r3.pass;
  const fail = r1.fail + r2.fail + r3.fail;
  console.log(`\n${fail === 0 ? '🎉 ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Verification crashed:', e); process.exit(1); });
