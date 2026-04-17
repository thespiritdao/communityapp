// src/features/pods/components/TreasuryRegistrationTool.tsx
'use client';

import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useReadContract } from 'wagmi';
import { parseAbi, encodeFunctionData } from 'viem';
import { useSendUserOperationWithAttribution } from '@/wallet/hooks/useSendUserOperationWithAttribution';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_POD_TREASURY_FACTORY as `0x${string}`;

const factoryABI = parseAbi([
  'function registerExistingTreasury(string memory podId, address treasuryAddress, uint256 managementHatId) external',
  'function owner() external view returns (address)',
  'function isPodTreasuryDeployed(string memory podId) external view returns (bool)',
  'function getTreasuryForPod(string memory podId) external view returns (address)',
]);

interface TreasuryToRegister {
  podId: string;
  treasuryAddress: string;
  managementHatId: string;
  podName?: string;
}

export function TreasuryRegistrationTool() {
  const { evmAddress: userAddress } = useEvmAddress();
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryToRegister | null>(null);

  // Hardcoded treasury that needs registration
  const UNREGISTERED_TREASURY: TreasuryToRegister = {
    podId: 'e35c9e25-d29f-4988-b1e8-2902e960b94c',
    treasuryAddress: '0xf00ca2682a8128affaada61c57322f0e6061c9e4',
    managementHatId: '0x0000074900010000000000000000000000000000000000000000000000000000',
    podName: 'Executive Pod',
  };

  // Check factory owner
  const { data: factoryOwner } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryABI,
    functionName: 'owner',
  });

  // Check if already registered
  const { data: isRegistered, refetch: refetchRegistration } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryABI,
    functionName: 'isPodTreasuryDeployed',
    args: [UNREGISTERED_TREASURY.podId],
  });

  // Registration transaction
  const { sendUserOperation: writeContract, status } = useSendUserOperationWithAttribution();
  const isPending = status === 'pending';
  const isSuccess = (status as string) === 'complete';

  const handleRegister = async () => {
    if (!selectedTreasury) return;

    const hatIdBigInt = BigInt(selectedTreasury.managementHatId);

    await writeContract({
      calls: [{
        to: FACTORY_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: factoryABI,
          functionName: 'registerExistingTreasury',
          args: [
            selectedTreasury.podId,
            selectedTreasury.treasuryAddress as `0x${string}`,
            hatIdBigInt,
          ],
        }),
      }],
    } as any);
  };

  const isOwner = userAddress && factoryOwner &&
    userAddress.toLowerCase() === (factoryOwner as string).toLowerCase();

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
        Treasury Registration Tool
      </h2>

      {!userAddress && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', marginBottom: '16px' }}>
          <p>⚠️ Please connect your wallet to use this tool.</p>
        </div>
      )}

      {userAddress && !isOwner && (
        <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '8px', marginBottom: '16px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>❌ Not Factory Owner</p>
          <p style={{ fontSize: '14px' }}>Your address: {userAddress}</p>
          <p style={{ fontSize: '14px' }}>Factory owner: {factoryOwner as string}</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>
            You must connect with the factory owner wallet to register treasuries.
          </p>
        </div>
      )}

      {isOwner && (
        <div style={{ padding: '16px', backgroundColor: '#d1fae5', borderRadius: '8px', marginBottom: '16px' }}>
          <p>✅ You are the factory owner. You can register treasuries.</p>
        </div>
      )}

      <div style={{
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: isRegistered ? '#f0fdf4' : '#fff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {UNREGISTERED_TREASURY.podName}
          </h3>
          {isRegistered ? (
            <span style={{
              padding: '4px 12px',
              backgroundColor: '#10b981',
              color: 'white',
              borderRadius: '16px',
              fontSize: '14px'
            }}>
              ✓ Registered
            </span>
          ) : (
            <span style={{
              padding: '4px 12px',
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '16px',
              fontSize: '14px'
            }}>
              ✗ Not Registered
            </span>
          )}
        </div>

        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
          <div><strong>Pod ID:</strong> {UNREGISTERED_TREASURY.podId}</div>
          <div><strong>Treasury:</strong> {UNREGISTERED_TREASURY.treasuryAddress}</div>
          <div><strong>Hat ID:</strong> {UNREGISTERED_TREASURY.managementHatId}</div>
        </div>

        {!isRegistered && isOwner && (
          <button
            onClick={() => {
              setSelectedTreasury(UNREGISTERED_TREASURY);
              handleRegister();
            }}
            disabled={isPending || isPending}
            style={{
              padding: '8px 16px',
              backgroundColor: isPending || isPending ? '#9ca3af' : '#2563eb',
              color: 'white',
              borderRadius: '6px',
              border: 'none',
              cursor: isPending || isPending ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {isPending ? 'Waiting for approval...' : isPending ? 'Registering...' : 'Register Treasury'}
          </button>
        )}
      </div>

      {isSuccess && (
        <div style={{ padding: '16px', backgroundColor: '#dbeafe', borderRadius: '8px', marginBottom: '16px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>✅ Transaction confirmed!</p>
        </div>
      )}

      {isSuccess && (
        <div style={{ padding: '16px', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            ✅ Treasury registered successfully!
          </p>
          <p style={{ fontSize: '14px' }}>
            You can now complete purchases for products in this pod's treasury.
          </p>
          <button
            onClick={() => refetchRegistration()}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Refresh Status
          </button>
        </div>
      )}

      <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
          Why is this needed?
        </h3>
        <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
          The treasury contract exists and is functional, but it hasn't been registered with the
          PodTreasuryFactory contract yet. The marketplace's purchase router checks the factory
          to ensure treasuries are legitimate before routing funds. Once registered, purchases
          will complete successfully.
        </p>
      </div>
    </div>
  );
}
