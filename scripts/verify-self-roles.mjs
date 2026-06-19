/**
 * Read-only verification of $SELF Phase 0 cross-contract role wiring.
 * Checks every grantRole from the deploy guide's Step 6 returns true, and that
 * no stray/wrong grants remain. Run: node scripts/verify-self-roles.mjs
 */
import 'dotenv/config';
import { createPublicClient, http, keccak256, toBytes, getAddress } from 'viem';
import { base } from 'viem/chains';

const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const client = createPublicClient({ chain: base, transport: http(RPC) });

// Deployed addresses (2026-06-16).
const A = {
  EPOCHS: '0xe9e9d5E3ACd9F738B58ffe82f974abd34766a7Bb',
  RECEIPT: '0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099',
  PRESTIGE: '0x133dB72eB94dD5aF9E5bB148a9656752E57aa103',
  MINTER: '0x265dd81EC19Ef936206d6e0f6B3E910877aE70B6',
  PAYMENT: '0x438a8Ce7F03b6dCFf140bFFB5818323aCd7bC20e',
  ADMIN: '0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d',
  POD_ADMIN: '0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF',
  // Backend smart wallet — the ACTUAL on-chain caller for sponsored backend ops
  // (mint-poc pattern). Backend roles (ATTESTOR/JANITOR/FULFILLER) must be held
  // by THIS, not the POD_ADMIN EOA, because it is msg.sender in user operations.
  SMART: '0x05c06af9fe1a996144902D9571d1d2783866cF63',
};

const role = (name) =>
  name === 'DEFAULT_ADMIN_ROLE'
    ? '0x0000000000000000000000000000000000000000000000000000000000000000'
    : keccak256(toBytes(name));

const HAS_ROLE_ABI = [
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

// [contract, roleName, account, expected, label]
const CHECKS = [
  // Required wiring
  [A.EPOCHS, 'MINTER_ROLE', A.MINTER, true, 'SelfEpochs MINTER → SelfMinter'],
  [A.EPOCHS, 'BURNER_ROLE', A.PAYMENT, true, 'SelfEpochs BURNER → SelfPayment'],
  [A.RECEIPT, 'MINTER_ROLE', A.PAYMENT, true, 'SelfReceipt MINTER → SelfPayment'],
  // Backend roles must be on the SMART WALLET (sponsored-op caller), not the EOA.
  [A.MINTER, 'ATTESTOR_ROLE', A.SMART, true, 'SelfMinter ATTESTOR → backend SMART wallet'],
  [A.PRESTIGE, 'JANITOR_ROLE', A.SMART, true, 'SelfPrestige JANITOR → backend SMART wallet'],
  [A.RECEIPT, 'FULFILLER_ROLE', A.SMART, true, 'SelfReceipt FULFILLER → backend SMART wallet'],
  // Admin retained everywhere
  [A.EPOCHS, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'SelfEpochs admin → 0xd481'],
  [A.RECEIPT, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'SelfReceipt admin → 0xd481'],
  [A.PRESTIGE, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'SelfPrestige admin → 0xd481'],
  [A.MINTER, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'SelfMinter admin → 0xd481'],
  [A.PAYMENT, 'DEFAULT_ADMIN_ROLE', A.ADMIN, true, 'SelfPayment admin → 0xd481'],
  [A.EPOCHS, 'EPOCH_ADMIN_ROLE', A.ADMIN, true, 'SelfEpochs EPOCH_ADMIN → 0xd481'],
  // Stray/wrong grants that must NOT be present
  [A.RECEIPT, 'MINTER_ROLE', A.MINTER, false, 'SelfReceipt MINTER must NOT be SelfMinter (the slip)'],
  [A.EPOCHS, 'LOCKER_ROLE', A.POD_ADMIN, false, 'SelfEpochs LOCKER unset (staking seam)'],
];

async function main() {
  console.log('\n=== $SELF Role Wiring Verification ===');
  console.log('RPC:', RPC, '\n');
  let pass = 0;
  let fail = 0;
  for (const [addr, roleName, account, expected, label] of CHECKS) {
    let actual;
    try {
      actual = await client.readContract({
        address: getAddress(addr),
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [role(roleName), getAddress(account)],
      });
    } catch (e) {
      console.log(`⚠️  ${label} — read failed: ${e.shortMessage || e.message?.slice(0, 60)}`);
      fail++;
      continue;
    }
    const ok = actual === expected;
    console.log(`${ok ? '✅' : '❌'} ${label}  (hasRole=${actual}, expected=${expected})`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${fail === 0 ? '🎉 ALL CHECKS PASSED' : `❌ ${fail} CHECK(S) FAILED`} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('Verification crashed:', e); process.exit(1); });
