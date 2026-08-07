/**
 * TreasuryProxy redeploy — closes the drain vector (hat-gated proxy).
 * See src/guides/deployment/TREASURYPROXY_FULL_REDEPLOY_GUIDE.md.
 *
 * What this script CAN do (keys we hold):
 *   1. Deploy the fixed TreasuryProxy (deployer = POD_ADMIN key; owner set to
 *      the existing proxy/factory owner wallet so ownership stays consistent).
 *   2. Propose SetProxy on the EXEC treasury (backend EOA wears the Exec
 *      management hat) — 1 of the 2 required approvals.
 *   3. Report who must complete the remaining approvals (checks DB pod leads
 *      against the hat on-chain so you know exactly who to ask).
 *   4. Verify the final state (--verify mode, run after all pods flip).
 *
 * What it CANNOT do (manual steps it will print):
 *   - 2nd Exec approval, TN approvals (both wearers), Treegens propose
 *   - CDP paymaster allowlist for the new proxy
 *   - Vercel env update
 *   - factory.updateAuthorizedProxy(NEW_PROXY) (owner = Remix wallet)
 *
 * Usage:
 *   node scripts/redeploy-treasury-proxy.mjs                 # dry-run plan
 *   node scripts/redeploy-treasury-proxy.mjs --execute       # deploy + exec propose
 *   node scripts/redeploy-treasury-proxy.mjs --verify 0xNEW  # post-flip checks
 */
import { createWalletClient, createPublicClient, http, encodeDeployData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTE = process.argv.includes('--execute');
const VERIFY_IDX = process.argv.indexOf('--verify');
const VERIFY_ADDR = VERIFY_IDX > -1 ? process.argv[VERIFY_IDX + 1] : null;

const env = Object.fromEntries(
  readFileSync(join(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const PK = env.POD_ADMIN_PRIVATE_KEY;
if (!PK) throw new Error('POD_ADMIN_PRIVATE_KEY not found in .env');
const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`);
const transport = http(env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org');
const wallet = createWalletClient({ account, chain: base, transport });
const client = createPublicClient({ chain: base, transport });
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const OWNER = '0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d'; // existing proxy/factory owner (Remix wallet)
const FACTORY = '0x3d68d59Dc78C45022bA37276FD1b03354F72B3b1'; // ORIGINAL factory (the one the proxy reads)
const OLD_PROXY = '0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae';
const HATS = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';

const PODS = [
  {
    name: 'Executive',
    id: 'e35c9e25-d29f-4988-b1e8-2902e960b94c',
    treasury: '0xE2c064379d14BAc8371F5CdD7938F9472dC739aA',
    hatId: BigInt('0x0000074900010000000000000000000000000000000000000000000000000000'),
  },
  {
    name: 'Temporal Naturalism',
    id: 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0',
    treasury: '0xe75b458a281634FF517fbb873dad5fa0d2F21553',
    hatId: BigInt('0x0000074900020001000000000000000000000000000000000000000000000000'),
  },
  {
    name: 'Treegens',
    id: 'a4f2eb44-c2d5-4c49-8629-f6f818960f98',
    treasury: '0xe1691F0F43FB78B9718A3F9f9C13B09712BBBa3a',
    hatId: 50280301357069824200217031064706067747510226502815431114826197237760000n,
  },
];

const hatsAbi = parseAbi([
  'function balanceOf(address,uint256) view returns (uint256)',
  'function hatSupply(uint256) view returns (uint32)',
]);
const treasuryAbi = parseAbi([
  'function authorizedProxy() view returns (address)',
  'function proposeSetProxy(address newProxy) returns (uint256)',
  'function proposalCount() view returns (uint256)',
  'function getRequiredApprovals() view returns (uint256)',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reportWhoMustAct(newProxy) {
  console.log('\n── Who must act (hat wearers vs DB pod leads) ──');
  for (const pod of PODS) {
    const supply = await client.readContract({ address: HATS, abi: hatsAbi, functionName: 'hatSupply', args: [pod.hatId] });
    const required = Math.floor((Number(supply) * 5001 + 9999) / 10000);
    await sleep(600);
    const { data } = await supabase.from('pods').select('pod_leads').eq('id', pod.id).single();
    const leads = data?.pod_leads || [];
    const leadStatus = [];
    for (const lead of leads) {
      const wears = await client.readContract({ address: HATS, abi: hatsAbi, functionName: 'balanceOf', args: [lead, pod.hatId] });
      leadStatus.push(`${lead} ${wears > 0n ? '(WEARS hat ✓)' : '(no hat ✗)'}`);
      await sleep(600);
    }
    const backendWears = await client.readContract({ address: HATS, abi: hatsAbi, functionName: 'balanceOf', args: [account.address, pod.hatId] });
    await sleep(600);
    console.log(`\n${pod.name}: ${supply} wearer(s), ${required} approval(s) needed`);
    console.log(`  backend EOA ${account.address}: ${backendWears > 0n ? 'WEARS hat ✓ (script can propose/approve)' : 'no hat'}`);
    console.log(`  DB pod leads: ${leadStatus.length ? leadStatus.join('; ') : '(none in DB)'}`);
    console.log(`  → action: hat wearer(s) call proposeSetProxy(${newProxy}) then approveProposal(id) DIRECTLY on ${pod.treasury}`);
  }
}

// ── VERIFY MODE ─────────────────────────────────────────────────────────────
if (VERIFY_ADDR) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(VERIFY_ADDR)) throw new Error('--verify needs the NEW_PROXY address');
  console.log('Verifying rollout of new proxy:', VERIFY_ADDR, '\n');
  let allFlipped = true;
  for (const pod of PODS) {
    const p = await client.readContract({ address: pod.treasury, abi: treasuryAbi, functionName: 'authorizedProxy' });
    const ok = p.toLowerCase() === VERIFY_ADDR.toLowerCase();
    if (!ok) allFlipped = false;
    console.log(`${pod.name.padEnd(22)} authorizedProxy: ${p} ${ok ? '✓ flipped' : p.toLowerCase() === OLD_PROXY.toLowerCase() ? '✗ still OLD proxy' : '✗ unexpected'}`);
    await sleep(700);
  }
  // Drain-vector check: simulate a distribution from a random (non-manager) address
  const proxyAbi = parseAbi(['function proxyDistributeTokens(string,address,address[],uint256[],string)']);
  const RANDOM = '0x000000000000000000000000000000000000dEaD';
  try {
    await client.simulateContract({
      address: VERIFY_ADDR, abi: proxyAbi, functionName: 'proxyDistributeTokens',
      args: [PODS[0].id, env.NEXT_PUBLIC_SELF_TOKEN, [RANDOM], [1n], 'drain test'],
      account: RANDOM,
    });
    console.log('\n❌ DRAIN CHECK FAILED: non-manager simulation did NOT revert — investigate before use!');
  } catch (e) {
    const msg = (e.shortMessage || e.message || '').split('\n')[0];
    console.log(`\n✓ Drain vector closed: non-manager call reverts (${msg})`);
  }
  console.log(allFlipped ? '\nAll treasuries flipped. Safe to remove OLD proxy from paymaster.' : '\nNot all treasuries flipped yet — keep OLD proxy sponsored until they are.');
  process.exit(0);
}

// ── PLAN / EXECUTE MODE ─────────────────────────────────────────────────────
console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN (pass --execute to deploy)'}`);
console.log('Deployer (backend):', account.address);
const bal = await client.getBalance({ address: account.address });
console.log('Deployer ETH:', Number(bal) / 1e18);

const artifact = JSON.parse(readFileSync(join(__dirname, '../artifacts/src/contracts/TreasuryProxy.sol/TreasuryProxy.json'), 'utf8'));

// 1. Deploy
let newProxy = '0xDRYRUN_NEW_PROXY';
console.log('\n1) Deploy fixed TreasuryProxy(factory, owner):', FACTORY, OWNER);
if (EXECUTE) {
  const hash = await wallet.sendTransaction({
    data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [FACTORY, OWNER] }),
  });
  console.log('   tx:', hash);
  const rcpt = await client.waitForTransactionReceipt({ hash });
  if (rcpt.status !== 'success') throw new Error('Proxy deployment reverted');
  newProxy = rcpt.contractAddress;
  console.log('   NEW_PROXY:', newProxy);
} else {
  console.log('   [dry-run] would deploy with the artifact at artifacts/src/contracts/TreasuryProxy.sol/');
}

// 2. Exec propose (backend EOA wears the Exec hat)
console.log('\n2) Propose SetProxy on Executive treasury (backend wears Exec hat)');
if (EXECUTE) {
  const before = await client.readContract({ address: PODS[0].treasury, abi: treasuryAbi, functionName: 'proposalCount' });
  const hash = await wallet.writeContract({
    address: PODS[0].treasury, abi: treasuryAbi, functionName: 'proposeSetProxy', args: [newProxy],
  });
  const rcpt = await client.waitForTransactionReceipt({ hash });
  if (rcpt.status !== 'success') throw new Error('Exec proposeSetProxy reverted');
  console.log(`   proposed (tx ${hash}); proposalId = ${before} — needs 1 more approval:`);
  console.log(`   another Exec hat wearer calls approveProposal(${before}) on ${PODS[0].treasury}`);
} else {
  console.log('   [dry-run] proposeSetProxy(NEW_PROXY) on', PODS[0].treasury);
}

// 3. Who must act
await reportWhoMustAct(newProxy);

// 4. Manual checklist
console.log(`\n── Remaining manual steps ──
  a. Exec: 2nd wearer approves the proposal above
  b. TN: one wearer proposes, the other approves (treasury ${PODS[1].treasury})
  c. Treegens: its wearer proposes → auto-executes (treasury ${PODS[2].treasury})
  d. CDP paymaster: allowlist ${newProxy} (function list in TREASURYPROXY_FULL_REDEPLOY_GUIDE.md)
  e. Vercel: NEXT_PUBLIC_TREASURY_PROXY=${newProxy} → redeploy app
  f. Factory housekeeping (owner ${OWNER} via Remix): updateAuthorizedProxy(${newProxy}) on ${FACTORY}
  g. When a-c done: node scripts/redeploy-treasury-proxy.mjs --verify ${newProxy}
  h. After verify passes: remove OLD proxy ${OLD_PROXY} from paymaster
  (I'll update .env and scripts/deploy-treasury-contracts.mjs PROXY constant once NEW_PROXY exists.)`);
