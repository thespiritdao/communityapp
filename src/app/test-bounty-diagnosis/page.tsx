'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import BountyManagerABI from '@/abis/BountyManager.json';

const SYSTEM_TOKEN_ADDRESS = '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
const HATS_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const BOUNTY_MANAGER_HAT = 182n;

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

export default function TestBountyDiagnosisPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [diagnostics, setDiagnostics] = useState<any>({});

  // Check Hat balance
  const { data: hatBalance } = useReadContract({
    address: HATS_ADDRESS,
    abi: HATS_ABI,
    functionName: 'balanceOf',
    args: address ? [address, BOUNTY_MANAGER_HAT] : undefined,
    watch: true
  });

  // Check token balance
  const { data: tokenBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    watch: true
  });

  // Check allowance
  const { data: allowance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && BOUNTY_MANAGER_ADDRESS ? [address, BOUNTY_MANAGER_ADDRESS] : undefined,
    watch: true
  });

  // Check if contract exists
  const checkContractExists = async () => {
    if (!publicClient || !BOUNTY_MANAGER_ADDRESS) return;
    
    try {
      const bytecode = await publicClient.getBytecode({
        address: BOUNTY_MANAGER_ADDRESS
      });
      
      setDiagnostics((prev: any) => ({
        ...prev,
        contractExists: !!bytecode && bytecode !== '0x',
        bytecodeLength: bytecode?.length || 0
      }));
    } catch (error) {
      setDiagnostics((prev: any) => ({
        ...prev,
        contractExists: false,
        contractError: error
      }));
    }
  };

  // Test contract function exists
  const testFunctionExists = async () => {
    if (!publicClient || !BOUNTY_MANAGER_ADDRESS) return;
    
    try {
      // Try to call a read-only function to test ABI
      const result = await publicClient.readContract({
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BountyManagerABI,
        functionName: 'nextBountyId'
      });
      
      setDiagnostics((prev: any) => ({
        ...prev,
        nextBountyId: result?.toString(),
        abiMatches: true
      }));
    } catch (error: any) {
      setDiagnostics((prev: any) => ({
        ...prev,
        abiMatches: false,
        abiError: error.message
      }));
    }
  };

  useEffect(() => {
    checkContractExists();
    testFunctionExists();
  }, [publicClient, BOUNTY_MANAGER_ADDRESS]);

  const formatEther = (value: bigint | undefined) => {
    if (!value) return '0';
    return (Number(value) / 1e18).toFixed(6);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🔍 Bounty System Diagnostic</h1>

      {/* Environment Check */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🌐 Environment Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span>Your Address:</span>
              <span className="font-mono">{address || 'Not connected'}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Bounty Manager:</span>
              <span className="font-mono">{BOUNTY_MANAGER_ADDRESS || '❌ Missing'}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>System Token:</span>
              <span className="font-mono">{SYSTEM_TOKEN_ADDRESS}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Hats Protocol:</span>
              <span className="font-mono">{HATS_ADDRESS}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Required Hat ID:</span>
              <span className="font-mono">{BOUNTY_MANAGER_HAT.toString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permission Check */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🎩 Hats Protocol Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <div className="flex justify-between items-center">
                <span>Bounty Manager Hat Balance:</span>
                <span className={`font-bold ${hatBalance && hatBalance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {hatBalance?.toString() || '0'}
                </span>
              </div>
              {hatBalance && hatBalance > 0 ? (
                <Alert className="bg-green-50 mt-2">
                  <AlertDescription>
                    ✅ You have the required Bounty Manager Hat (ID: {BOUNTY_MANAGER_HAT.toString()})
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="bg-red-50 mt-2">
                  <AlertDescription>
                    ❌ You don't have the required Bounty Manager Hat (ID: {BOUNTY_MANAGER_HAT.toString()})
                    <br />
                    This will cause the createBounty function to fail with "Not bounty manager" error.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>💰 Token Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="p-3 border rounded-lg">
              <p className="text-gray-600 mb-1">SYSTEM Balance</p>
              <p className="font-mono font-bold text-lg">{formatEther(tokenBalance)}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-gray-600 mb-1">Allowance</p>
              <p className="font-mono font-bold text-lg">{formatEther(allowance)}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-gray-600 mb-1">Status</p>
              <p className={`font-bold ${allowance && allowance > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {allowance && allowance > 0 ? '✅ Approved' : '⚠️ Not Approved'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contract Verification */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📋 Contract Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span>Contract Deployed:</span>
                <span className={`font-bold ${diagnostics.contractExists ? 'text-green-600' : 'text-red-600'}`}>
                  {diagnostics.contractExists ? '✅ Yes' : '❌ No'}
                </span>
              </div>
              {diagnostics.bytecodeLength > 0 && (
                <p className="text-xs text-gray-500">Bytecode length: {diagnostics.bytecodeLength} bytes</p>
              )}
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span>ABI Compatibility:</span>
                <span className={`font-bold ${diagnostics.abiMatches ? 'text-green-600' : 'text-red-600'}`}>
                  {diagnostics.abiMatches ? '✅ Match' : '❌ Mismatch'}
                </span>
              </div>
              {diagnostics.nextBountyId && (
                <p className="text-xs text-gray-500">Next Bounty ID: {diagnostics.nextBountyId}</p>
              )}
              {diagnostics.abiError && (
                <p className="text-xs text-red-500 mt-1">Error: {diagnostics.abiError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis Summary */}
      <Card>
        <CardHeader>
          <CardTitle>🎯 Root Cause Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {!hatBalance || hatBalance === 0n ? (
              <Alert className="bg-red-50">
                <AlertDescription>
                  🚨 <strong>PRIMARY ISSUE: Missing Bounty Manager Hat</strong>
                  <br />
                  You need Hat ID {BOUNTY_MANAGER_HAT.toString()} to create bounties. This is likely the main cause of your transaction failures.
                </AlertDescription>
              </Alert>
            ) : null}

            {!diagnostics.contractExists ? (
              <Alert className="bg-red-50">
                <AlertDescription>
                  🚨 <strong>CRITICAL: Contract Not Found</strong>
                  <br />
                  The contract address may be incorrect or not deployed on this network.
                </AlertDescription>
              </Alert>
            ) : null}

            {!diagnostics.abiMatches ? (
              <Alert className="bg-red-50">
                <AlertDescription>
                  🚨 <strong>ABI MISMATCH</strong>
                  <br />
                  The ABI file doesn't match the deployed contract. This will cause transaction building to fail.
                </AlertDescription>
              </Alert>
            ) : null}

            {(!allowance || allowance === 0n) ? (
              <Alert className="bg-yellow-50">
                <AlertDescription>
                  ⚠️ <strong>Token Approval Required</strong>
                  <br />
                  You need to approve SYSTEM tokens before creating bounties.
                </AlertDescription>
              </Alert>
            ) : null}

            {hatBalance && hatBalance > 0n && diagnostics.contractExists && diagnostics.abiMatches && allowance && allowance > 0n ? (
              <Alert className="bg-green-50">
                <AlertDescription>
                  ✅ <strong>All Prerequisites Met</strong>
                  <br />
                  You have the required permissions and setup. The issue may be in OnchainKit configuration or function parameters.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="mt-6">
            <Button 
              onClick={() => {
                checkContractExists();
                testFunctionExists();
              }}
              className="w-full"
            >
              🔄 Re-run Diagnostics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}