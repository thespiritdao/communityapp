/**
 * Authorize backend callers on HatMinter.
 *
 * The server calls HatMinter from two wallets: member-hat mints go through the
 * CDP smart wallet (BACKEND_SMART_WALLET_ADDRESS), and the executive-leader
 * mint in src/app/api/onboarding/mint-hat is sent directly by the admin EOA
 * (POD_ADMIN_PRIVATE_KEY). Both need to be authorized.
 *
 * Must be run by the HatMinter owner (PRIVATE_KEY).
 *
 * Usage:
 *   npx tsx scripts/deploy/authorize-backend-caller.ts             # both server wallets
 *   npx tsx scripts/deploy/authorize-backend-caller.ts 0xabc 0xdef # specific addresses
 */

import { createWalletClient, createPublicClient, http, parseAbi, getContract } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HAT_MINTER = process.env.NEXT_PUBLIC_HAT_MINTER?.trim();
const OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const asKey = (k: string) => (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;

function targets(): string[] {
  const args = process.argv.slice(2);
  if (args.length) return args;
  const list: string[] = [];
  if (process.env.BACKEND_SMART_WALLET_ADDRESS) list.push(process.env.BACKEND_SMART_WALLET_ADDRESS);
  if (process.env.POD_ADMIN_PRIVATE_KEY) list.push(privateKeyToAccount(asKey(process.env.POD_ADMIN_PRIVATE_KEY)).address);
  return list;
}

const HAT_MINTER_ABI = parseAbi([
  'function setAuthorizedCaller(address caller, bool authorized) external',
  'function isAuthorizedCaller(address caller) external view returns (bool)',
  'function owner() external view returns (address)',
]);

async function main() {
  const addresses = targets();
  if (!HAT_MINTER) throw new Error('Set NEXT_PUBLIC_HAT_MINTER');
  if (!OWNER_PRIVATE_KEY) throw new Error('Set PRIVATE_KEY (the HatMinter owner)');
  if (!addresses.length) throw new Error('Pass addresses, or set BACKEND_SMART_WALLET_ADDRESS / POD_ADMIN_PRIVATE_KEY');
  for (const a of addresses) if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Not an address: ${a}`);

  const owner = privateKeyToAccount(asKey(OWNER_PRIVATE_KEY));
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account: owner, chain: base, transport: http(RPC_URL) });
  const hatMinter = getContract({
    address: HAT_MINTER as `0x${string}`,
    abi: HAT_MINTER_ABI,
    client: { public: publicClient, wallet: walletClient },
  });

  const contractOwner = await hatMinter.read.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`Signer ${owner.address} is not the HatMinter owner (${contractOwner})`);
  }
  console.log(`HatMinter ${HAT_MINTER}, owner ${owner.address}\n`);

  for (const address of addresses as `0x${string}`[]) {
    if (await hatMinter.read.isAuthorizedCaller([address])) {
      console.log(`  already authorized  ${address}`);
      continue;
    }
    const hash = await hatMinter.write.setAuthorizedCaller([address, true]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error(`Authorization of ${address} failed (${hash})`);
    const ok = await hatMinter.read.isAuthorizedCaller([address]);
    console.log(`  ${ok ? 'authorized' : 'NOT AUTHORIZED'}          ${address}  tx ${hash}`);
  }
}

main().catch((err) => {
  console.error(`Failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
