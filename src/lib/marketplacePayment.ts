// src/lib/marketplacePayment.ts
// Server-side proof that a marketplace checkout was paid on-chain.
//
// A checkout is one CDP user operation calling a purchase contract with the
// cart's product ids joined by commas and the cart total: the routers emit
// PurchaseCompleted, the legacy burn PurchaseArtifact, and SelfPaymentV2
// (soulbound $SELF, the current $SELF path) PaidWithSelf with the credited
// weighted hours. We look the operation up at the bundler, then
// require: it succeeded, it was sent by one of the buyer's accounts, and it
// carries a purchase event from a known contract for exactly these products
// paying at least their listed prices.

import { decodeEventLog, keccak256, parseUnits, toBytes, type Abi, type Hex } from 'viem';
import PurchaseRouterABI from '@/abis/PurchaseRouter.json';
import PurchaseRouterDecentralizedABI from '@/abis/PurchaseRouterDecentralized.json';
import PurchaseBurnABI from '@/abis/purchaseBurnABI.json';
import SelfPaymentV2ABI from '@/abis/SelfPaymentV2.json';

const BUNDLER_URL = process.env.NEXT_PUBLIC_PAYMASTER;

const asAbi = (a: unknown) => ((a as { abi?: Abi }).abi ?? a) as Abi;

function purchaseContracts(): Map<string, Abi> {
  const m = new Map<string, Abi>();
  const add = (addr: string | undefined, abi: unknown) => {
    if (addr) m.set(addr.toLowerCase(), asAbi(abi));
  };
  add(process.env.NEXT_PUBLIC_PURCHASE_ROUTER, PurchaseRouterABI);
  add(process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED, PurchaseRouterDecentralizedABI);
  add(process.env.NEXT_PUBLIC_PURCHASE_BURN, PurchaseBurnABI);
  add(process.env.NEXT_PUBLIC_SELF_PAYMENT, SelfPaymentV2ABI);
  return m;
}

export type CartLine = { productId: string; quantity: number; priceSelf: number; priceSystem: number };

export type PurchaseProof =
  | {
      ok: true;
      transactionHash: string;
      buyer: string;
      systemAmount: bigint;
      selfAmount: bigint;
    }
  | { ok: false; reason: string };

type UserOpReceipt = {
  success: boolean;
  sender: string;
  logs: { address: string; topics: Hex[]; data: Hex }[];
  receipt?: { transactionHash: string };
};

async function getUserOpReceipt(userOpHash: string): Promise<UserOpReceipt | null> {
  if (!BUNDLER_URL) throw new Error('NEXT_PUBLIC_PAYMASTER (bundler URL) is not set');
  const res = await fetch(BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getUserOperationReceipt', params: [userOpHash] }),
  });
  const body = await res.json().catch(() => null);
  return (body?.result as UserOpReceipt) ?? null;
}

export async function verifyMarketplacePurchase(params: {
  userOpHash: string;
  /** Lowercased accounts the buyer controls (CDP EOAs + smart accounts). */
  buyerAccounts: string[];
  lines: CartLine[];
  token: '$SELF' | '$SYSTEM';
}): Promise<PurchaseProof> {
  const { userOpHash, buyerAccounts, lines, token } = params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(userOpHash)) return { ok: false, reason: 'Not a user operation hash' };
  if (lines.length === 0) return { ok: false, reason: 'Empty cart' };

  // The receipt can lag the client's success callback by a few seconds.
  let receipt: UserOpReceipt | null = null;
  for (let i = 0; i < 5 && !receipt; i++) {
    receipt = await getUserOpReceipt(userOpHash);
    if (!receipt) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!receipt) return { ok: false, reason: 'The payment is not on-chain yet' };
  if (!receipt.success) return { ok: false, reason: 'The payment transaction failed' };
  const sender = receipt.sender.toLowerCase();
  if (!buyerAccounts.includes(sender)) return { ok: false, reason: 'The payment was sent by a different wallet' };

  const joinedIds = lines.map((l) => l.productId).join(',');
  const joinedHash = keccak256(toBytes(joinedIds)).toLowerCase();
  const contracts = purchaseContracts();

  let systemAmount = 0n;
  let selfAmount = 0n;
  let matched = false;
  for (const log of receipt.logs) {
    const abi = contracts.get(log.address.toLowerCase());
    if (!abi) continue;
    let ev: { eventName: string; args: Record<string, unknown> };
    try {
      ev = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as unknown as typeof ev;
    } catch {
      continue;
    }
    if (ev.eventName === 'PurchaseCompleted') {
      // productId is an indexed string, so the log holds its hash.
      if (String(ev.args.buyer).toLowerCase() !== sender) continue;
      if (String(log.topics[2]).toLowerCase() !== joinedHash) continue;
    } else if (ev.eventName === 'PurchaseArtifact') {
      if (String(ev.args.user).toLowerCase() !== sender) continue;
      if (String(ev.args.productId) !== joinedIds) continue;
    } else if (ev.eventName === 'PaidWithSelf') {
      if (String(ev.args.payer).toLowerCase() !== sender) continue;
      if (String(ev.args.productId) !== joinedIds) continue;
      selfAmount += BigInt(ev.args.weightedHours as bigint);
      matched = true;
      continue;
    } else {
      continue;
    }
    systemAmount += BigInt(ev.args.systemAmount as bigint);
    selfAmount += BigInt(ev.args.selfAmount as bigint);
    matched = true;
  }
  if (!matched) return { ok: false, reason: 'No purchase of these items in that transaction' };

  const expected = lines.reduce(
    (sum, l) =>
      sum +
      parseUnits(String(token === '$SELF' ? l.priceSelf : l.priceSystem), 18) * BigInt(l.quantity),
    0n,
  );
  const paid = token === '$SELF' ? selfAmount : systemAmount;
  // The cart converts decimal prices to wei through JS floats (19.99 becomes
  // 19.989999999999998437e18), so allow 0.01% of rounding.
  if (paid < expected - expected / 10_000n) return { ok: false, reason: 'The amount paid is less than the listed price' };

  return {
    ok: true,
    transactionHash: receipt.receipt?.transactionHash ?? userOpHash,
    buyer: sender,
    systemAmount,
    selfAmount,
  };
}
