'use client';

import { useState } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ProxyHatIdFixerProps {
  proxyAddress: string;
  managementHatId: string;
  membershipHatId?: string;
  podName?: string;
}

const PROXY_ABI = [
  {
    name: 'setHatIds',
    type: 'function',
    inputs: [
      { name: '_managementHatId', type: 'uint256' },
      { name: '_membershipHatId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export function ProxyHatIdFixer({
  proxyAddress,
  managementHatId,
  membershipHatId = '0',
  podName = 'this pod',
}: ProxyHatIdFixerProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation, status, error: txError } = useSendUserOperation();
  const [isFixed, setIsFixed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFixProxy = async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      setErrorMsg('Smart account not available');
      return;
    }

    try {
      setErrorMsg(null);

      const data = encodeFunctionData({
        abi: PROXY_ABI,
        functionName: 'setHatIds',
        args: [BigInt(managementHatId), BigInt(membershipHatId)],
      });

      const result = await sendUserOperation({
        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
        network: 'base',
        calls: [{
          to: proxyAddress as `0x${string}`,
          data,
          value: 0n,
        }],
      });

      console.log('✅ Proxy HAT IDs set successfully!', result);
      setIsFixed(true);
    } catch (err) {
      console.error('❌ Failed to set proxy HAT IDs:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  return (
    <Card
      className="p-6 border mb-6"
      style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}
    >
      <h3 className="text-lg font-bold mb-2" style={{ color: '#8F6B2F' }}>
        🔧 Proxy Configuration Fix Required
      </h3>
      <p className="text-sm text-gray-700 mb-4">
        The proxy for <strong>{podName}</strong> needs to be configured with the
        Management HAT ID. This is a one-time operation required to enable
        eligibility criteria management.
      </p>

      <div
        className="bg-white p-4 rounded border mb-4"
        style={{ borderColor: '#E8D7B8' }}
      >
        <p className="text-xs font-mono text-gray-600 mb-2">
          <strong>Issue:</strong> managementHatId = 0 (not set)
        </p>
        <p className="text-xs font-mono text-gray-600">
          <strong>Fix:</strong> Setting to {managementHatId.substring(0, 20)}...
        </p>
      </div>

      {!isFixed ? (
        <>
          <Button
            onClick={handleFixProxy}
            disabled={status === 'pending' || !address}
            className="w-full bg-[#C6933F] hover:bg-[#A67E35]"
          >
            {status === 'pending' ? '⏳ Fixing...' : 'Fix Proxy Configuration'}
          </Button>
          {(errorMsg || txError) && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              ❌ {errorMsg || txError?.message}
            </div>
          )}
        </>
      ) : (
        <div
          className="p-4 rounded border"
          style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
        >
          <p className="font-semibold" style={{ color: '#2F5D50' }}>
            ✅ Proxy fixed!
          </p>
          <p className="text-sm mt-2" style={{ color: '#3F7A5A' }}>
            Try saving eligibility criteria now. You may need to refresh the
            page.
          </p>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-600 bg-gray-50 p-3 rounded">
        <p className="font-semibold mb-1">Technical Details:</p>
        <p>
          <strong>Proxy:</strong> {proxyAddress}
        </p>
        <p>
          <strong>Management HAT:</strong> {managementHatId.substring(0, 30)}...
        </p>
        <p>
          <strong>Your Address:</strong> {address || 'Not connected'}
        </p>
      </div>
    </Card>
  );
}
