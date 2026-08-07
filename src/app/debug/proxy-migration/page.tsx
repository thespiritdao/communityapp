'use client';

/**
 * /debug/proxy-migration — one-time admin tool for the 2026-08 TreasuryProxy
 * migration (hat-gated proxy replacing the drainable one; see
 * src/guides/deployment/TREASURYPROXY_FULL_REDEPLOY_GUIDE.md).
 *
 * Lets a pod-management-hat wearer (CDP smart account) submit, from the app:
 *   - proposeSetProxy(NEW_PROXY) on their treasury
 *   - approveProposal(id) on their treasury
 * Calls go directly to the TREASURY contract (not the proxy) because those
 * functions are onlyPodManagers. Gasless via the CDP paymaster — the three
 * treasury addresses must be allowlisted for these two functions.
 *
 * Safe to remove after all treasuries point at the new proxy.
 */

import { useEffect, useState } from 'react';
import { useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// HARDCODED on purpose: this is a one-time migration tool targeting exactly
// one contract. Reading the env here made the page show the OLD proxy as the
// target when a build ran before the Vercel env update — hiding the buttons.
const NEW_PROXY = '0x2015f0a8f809e21664c36d98005fcfca49ebd904' as `0x${string}`;
const HATS = '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`;

const TREASURIES: {
  name: string;
  address: `0x${string}`;
  hatId: bigint;
}[] = [
  {
    name: 'Executive Pod',
    address: '0xE2c064379d14BAc8371F5CdD7938F9472dC739aA',
    hatId: BigInt('0x0000074900010000000000000000000000000000000000000000000000000000'),
  },
  {
    name: 'Temporal Naturalism',
    address: '0xe75b458a281634FF517fbb873dad5fa0d2F21553',
    hatId: BigInt('0x0000074900020001000000000000000000000000000000000000000000000000'),
  },
  {
    name: 'Treegens DAO',
    address: '0xe1691F0F43FB78B9718A3F9f9C13B09712BBBa3a',
    hatId: BigInt(
      '50280301357069824200217031064706067747510226502815431114826197237760000',
    ),
  },
];

const treasuryAbi = parseAbi([
  'function authorizedProxy() view returns (address)',
  'function proposeSetProxy(address newProxy) returns (uint256)',
  'function approveProposal(uint256 proposalId)',
  'function proposalCount() view returns (uint256)',
]);
const hatsAbi = parseAbi([
  'function balanceOf(address,uint256) view returns (uint256)',
]);

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

interface TreasuryState {
  currentProxy?: string;
  wearsHat?: boolean;
  proposalCount?: number;
}

export default function ProxyMigrationPage() {
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const smartAccount = currentUser?.evmSmartAccounts?.[0];

  const [state, setState] = useState<Record<string, TreasuryState>>({});
  const [approveIds, setApproveIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 20));

  const refresh = async () => {
    for (const t of TREASURIES) {
      try {
        const [currentProxy, count, hat] = await Promise.all([
          client.readContract({ address: t.address, abi: treasuryAbi, functionName: 'authorizedProxy' }),
          client.readContract({ address: t.address, abi: treasuryAbi, functionName: 'proposalCount' }),
          smartAccount
            ? client.readContract({ address: HATS, abi: hatsAbi, functionName: 'balanceOf', args: [smartAccount as `0x${string}`, t.hatId] })
            : Promise.resolve(0n),
        ]);
        setState((s) => ({
          ...s,
          [t.address]: {
            currentProxy,
            proposalCount: Number(count),
            wearsHat: (hat as bigint) > 0n,
          },
        }));
      } catch {
        // leave row blank on read failure
      }
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartAccount]);

  const submit = async (
    t: (typeof TREASURIES)[number],
    fn: 'proposeSetProxy' | 'approveProposal',
    arg: bigint | `0x${string}`,
  ) => {
    if (!smartAccount) return;
    setBusy(`${t.address}-${fn}`);
    try {
      const data = encodeFunctionData({
        abi: treasuryAbi,
        functionName: fn,
        args: [arg] as any,
      });
      await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: t.address, value: 0n, data }],
        useCdpPaymaster: true,
      });
      say(`✅ ${t.name}: ${fn} submitted`);
      setTimeout(refresh, 4000);
    } catch (e: any) {
      say(`❌ ${t.name}: ${fn} failed — ${e?.shortMessage || e?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl py-8 bottom-nav-spacing px-4">
      <h1 className="text-2xl font-bold mb-2">Treasury Proxy Migration</h1>
      <p className="text-sm text-[#5F5A54] mb-1">
        Target (new hat-gated proxy): <code>{NEW_PROXY}</code>
      </p>
      <p className="text-sm text-[#5F5A54] mb-6">
        Only pod-management-hat wearers can act. Propose once per treasury; a
        second wearer approves (Treegens auto-executes on propose).
      </p>

      {!smartAccount && (
        <p className="text-[#8B3A3A]">Connect your wallet to continue.</p>
      )}

      {TREASURIES.map((t) => {
        const s = state[t.address] || {};
        const done = s.currentProxy?.toLowerCase() === NEW_PROXY.toLowerCase();
        return (
          <div key={t.address} className="mb-4 p-4 border rounded-lg bg-white">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">{t.name}</h2>
                <p className="text-xs text-[#5F5A54]">{t.address}</p>
                <p className="text-xs mt-1">
                  current proxy:{' '}
                  <code>{s.currentProxy ? `${s.currentProxy.slice(0, 10)}…` : '…'}</code>{' '}
                  {done ? (
                    <span className="text-[#2F5D50] font-semibold">✓ MIGRATED</span>
                  ) : (
                    <span className="text-[#8F6B2F]">old proxy — action needed</span>
                  )}
                </p>
                <p className="text-xs">
                  your hat:{' '}
                  {s.wearsHat === undefined ? '…' : s.wearsHat ? '✓ manager' : '✗ not a manager here'}
                </p>
                <p className="text-xs">proposals so far: {s.proposalCount ?? '…'}</p>
              </div>
              {!done && (
                <div className="flex flex-col gap-2 items-end">
                  <button
                    disabled={!smartAccount || !s.wearsHat || busy !== null}
                    onClick={() => submit(t, 'proposeSetProxy', NEW_PROXY)}
                    className="px-3 py-2 rounded bg-[#2F5D50] text-white text-sm disabled:opacity-40"
                  >
                    {busy === `${t.address}-proposeSetProxy` ? 'Submitting…' : 'Propose new proxy'}
                  </button>
                  <div className="flex gap-1 items-center">
                    <input
                      value={approveIds[t.address] || ''}
                      onChange={(e) =>
                        setApproveIds((a) => ({ ...a, [t.address]: e.target.value }))
                      }
                      placeholder="proposal id"
                      className="w-24 border rounded px-2 py-1 text-sm"
                    />
                    <button
                      disabled={
                        !smartAccount || !s.wearsHat || busy !== null ||
                        approveIds[t.address] === undefined || approveIds[t.address] === ''
                      }
                      onClick={() =>
                        submit(t, 'approveProposal', BigInt(approveIds[t.address]))
                      }
                      className="px-3 py-2 rounded border border-[#2F5D50] text-[#2F5D50] text-sm disabled:opacity-40"
                    >
                      {busy === `${t.address}-approveProposal` ? 'Submitting…' : 'Approve'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="mt-6">
        <h3 className="font-semibold text-sm mb-1">Log</h3>
        {log.map((l, i) => (
          <p key={i} className="text-xs text-[#5F5A54]">{l}</p>
        ))}
      </div>

      <p className="text-xs text-[#5F5A54] mt-6">
        Known pending: Executive proposal <strong>#0</strong> is already proposed
        (by the backend) and needs one approval from an Exec manager — enter 0
        and press Approve.
      </p>
    </div>
  );
}
