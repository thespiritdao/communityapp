'use client';

import { useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';

const NEW_PROXY = '0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae' as const;

const TREASURIES = [
  { name: 'Executive Pod', address: '0x0b76FDF7afa6c38BA0a99aA95b8899631335E70B' as const },
  { name: 'Temporal Naturalism', address: '0xF2d28ba2c110c415cD75824F1e390Ea807793bac' as const },
];

const SET_PROXY_ABI = [{
  name: 'setAuthorizedProxy',
  type: 'function',
  inputs: [{ name: '_proxy', type: 'address' }],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const;

export default function FixProxyPage() {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const [status, setStatus] = useState<Record<string, string>>({});

  const smartAccount = currentUser?.evmSmartAccounts?.[0];

  async function fixTreasury(name: string, address: `0x${string}`) {
    setStatus(s => ({ ...s, [name]: 'pending' }));
    try {
      const data = encodeFunctionData({ abi: SET_PROXY_ABI, functionName: 'setAuthorizedProxy', args: [NEW_PROXY] });
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: address, value: 0n, data }],
        paymasterUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/paymaster`,
      });
      console.log(name, 'result:', result);
      setStatus(s => ({ ...s, [name]: 'done' }));
    } catch (e: any) {
      console.error(name, e);
      setStatus(s => ({ ...s, [name]: 'error: ' + (e?.message || 'unknown') }));
    }
  }

  async function fixAll() {
    for (const t of TREASURIES) {
      await fixTreasury(t.name, t.address);
    }
  }

  if (!smartAccount) {
    return <div className="p-8 text-red-600">Not logged in — sign in with your in-app wallet first.</div>;
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold mb-2">Fix Treasury Proxy Authorization</h1>
      <p className="text-sm text-gray-500 mb-1">Connected: {smartAccount}</p>
      <p className="text-sm text-gray-500 mb-6">New proxy: {NEW_PROXY}</p>

      <div className="space-y-4 mb-6">
        {TREASURIES.map(t => (
          <div key={t.name} className="border rounded p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-gray-400">{t.address}</div>
              {status[t.name] && (
                <div className={`text-xs mt-1 ${status[t.name] === 'done' ? 'text-green-600' : status[t.name] === 'pending' ? 'text-yellow-600' : 'text-red-600'}`}>
                  {status[t.name] === 'pending' ? 'Sending...' : status[t.name]}
                </div>
              )}
            </div>
            <button
              onClick={() => fixTreasury(t.name, t.address)}
              disabled={status[t.name] === 'pending' || status[t.name] === 'done'}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
            >
              Fix
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={fixAll}
        disabled={TREASURIES.every(t => status[t.name] === 'done' || status[t.name] === 'pending')}
        className="w-full py-2 bg-gray-900 text-white rounded disabled:opacity-50"
      >
        Fix Both
      </button>

      {TREASURIES.every(t => status[t.name] === 'done') && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          ✅ Both treasuries updated. You can now test treasury distributions.
        </div>
      )}
    </div>
  );
}
