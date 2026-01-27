'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TreasuryManagement } from './TreasuryManagement';
import { Wallet, Plus, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

// Contract addresses from environment
const POD_TREASURY_FACTORY_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const PODS_TESTING_MODE = process.env.NEXT_PUBLIC_PODS_TESTING === 'true';

// Default supported tokens from environment (Your community currencies)
const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const SELF_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SELF_TOKEN ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

const DEFAULT_SUPPORTED_TOKENS = [
  SYSTEM_TOKEN_ADDRESS, // $SYSTEM from .env
  SELF_TOKEN_ADDRESS,   // $SELF from .env
] as `0x${string}`[];

// Public client for fetching transaction receipts
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Factory ABI for treasury deployment
const TREASURY_FACTORY_ABI = [
  {
    name: 'deployTreasury',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'managementHatId', type: 'uint256' },
      { name: 'supportedTokens', type: 'address[]' },
      { name: 'testingMode', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

interface Pod {
  id: string;
  name: string;
  management_hat_id: string;
  treasury_contract_address?: string;
  is_active?: boolean;
}

interface PodSpecificTreasuryManagerProps {
  pod: Pod;
  canManageTreasury: boolean;
}

/**
 * Pod-specific treasury manager that shows deployment interface when no treasury exists
 * and regular treasury management when treasury is active
 */
export function PodSpecificTreasuryManager({
  pod,
  canManageTreasury,
}: PodSpecificTreasuryManagerProps) {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [localPod, setLocalPod] = useState(pod);
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // Update local pod when prop changes
  useEffect(() => {
    setLocalPod(pod);
  }, [pod]);

  // Check if pod has an active treasury (deployed, not 'pending')
  const hasTreasury =
    !!localPod.treasury_contract_address &&
    localPod.treasury_contract_address !== 'pending' &&
    localPod.treasury_contract_address !== '0x0000000000000000000000000000000000000000';

  // Convert management hat ID to BigInt for contract calls
  const getManagementHatIdBigInt = (hatId: string): bigint => {
    if (!hatId) return BigInt(0);
    if (hatId.startsWith('0x')) {
      return BigInt(hatId);
    }
    // Handle decimal string
    return BigInt(hatId);
  };

  /**
   * Recover treasury address from a previous transaction hash
   */
  const handleRecoverTreasuryAddress = async (txHash: string) => {
    try {
      console.log('🔍 Fetching receipt for transaction:', txHash);

      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      console.log('📦 Got receipt:', receipt);

      // TreasuryDeployed event signature
      const TREASURY_DEPLOYED_EVENT =
        '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

      let treasuryAddress = '';

      if (receipt.logs) {
        const deploymentLog = receipt.logs.find(
          (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
        );

        if (deploymentLog) {
          const addressFromTopic = deploymentLog.topics?.[2];
          if (addressFromTopic && addressFromTopic.length === 66) {
            treasuryAddress = '0x' + addressFromTopic.slice(-40);
          }
        }
      }

      if (!treasuryAddress) {
        console.error('❌ Could not extract treasury address from logs');
        toast({
          title: 'Recovery Failed',
          description: 'Could not find treasury address in transaction logs.',
          variant: 'destructive',
        });
        return;
      }

      console.log('✅ Extracted treasury address:', treasuryAddress);

      // Update database
      const updateResponse = await fetch('/api/pods/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podId: localPod.id,
          treasuryAddress: treasuryAddress,
          isActive: true,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update pod with treasury address');
      }

      toast({
        title: 'Treasury Recovered!',
        description: `Treasury at ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)} saved to database.`,
      });

      // Update local state
      setLocalPod({
        ...localPod,
        treasury_contract_address: treasuryAddress,
      });
    } catch (error: any) {
      console.error('❌ Treasury recovery failed:', error);
      toast({
        title: 'Recovery Failed',
        description: error.message || 'Could not recover treasury address.',
        variant: 'destructive',
      });
    }
  };

  /**
   * CDP Smart Account transaction handler - Treasury Deployment
   */
  const handleDeployViaCDP = async () => {
    // EXACT FAUCET PATTERN: Simple validation
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for treasury deployment:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to deploy treasury.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for treasury deployment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🏦 Pod ID:', localPod.id);
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Prepare deployment call
      const callData = encodeFunctionData({
        abi: TREASURY_FACTORY_ABI,
        functionName: 'deployTreasury',
        args: [
          localPod.id,
          getManagementHatIdBigInt(localPod.management_hat_id),
          DEFAULT_SUPPORTED_TOKENS,
          PODS_TESTING_MODE,
        ],
      });

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: POD_TREASURY_FACTORY_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // CDP UserOperations don't return receipt directly - need to fetch it
      const resultWithHash = result as any;
      const userOpHash = resultWithHash?.userOperationHash || resultWithHash?.hash;

      if (!userOpHash) {
        console.error('❌ No userOperationHash in result:', result);
        toast({
          title: 'Transaction Error',
          description: 'Could not get transaction hash from result.',
          variant: 'destructive',
        });
        return;
      }

      console.log('⏳ Waiting for transaction receipt...', { userOpHash });

      // Wait for the transaction to be confirmed and fetch the receipt
      let receipt;
      try {
        // Try to wait for the receipt using the userOperationHash
        // For CDP transactions, the userOperationHash IS the transaction hash
        receipt = await publicClient.waitForTransactionReceipt({
          hash: userOpHash as `0x${string}`,
          timeout: 60_000, // 60 second timeout
        });

        console.log('✅ Got receipt!', receipt);
      } catch (waitError: any) {
        console.warn('⚠️ waitForTransactionReceipt failed:', waitError.message);

        // Fallback: Try direct fetch (transaction might already be mined)
        try {
          console.log('🔄 Attempting fallback receipt fetch...');
          const fallbackReceipt = await publicClient.getTransactionReceipt({
            hash: userOpHash as `0x${string}`,
          });

          if (fallbackReceipt) {
            console.log('✅ Fallback receipt fetch succeeded!', fallbackReceipt);
            receipt = fallbackReceipt;
          } else {
            throw new Error('Receipt not found via fallback');
          }
        } catch (fallbackError) {
          console.error('❌ Fallback receipt fetch also failed:', fallbackError);

          // 📖 NOTE: This is EXPECTED for CDP UserOperations
          // The userOperationHash ≠ final transaction hash (ERC-4337)
          // The transaction is submitted successfully, but we can't get the receipt
          // until the bundler processes it and submits it on-chain.
          // See: CDP_RECEIPT_FETCHING_FIX.md for details

          // Transaction submitted but we can't get the receipt yet
          // Poll the factory contract to see if treasury was deployed
          console.log('💡 Treasury deployment submitted successfully!');
          console.log('⏳ The transaction is being processed by the bundler.');
          console.log('🔄 Polling factory contract for treasury address...');
          console.log(
            '🔍 Check Base block explorer (search for UserOperation hash):',
            `https://basescan.org/tx/${userOpHash}`,
          );

          toast({
            title: 'Treasury Deployment Submitted',
            description:
              'Waiting for deployment to confirm... This may take 30-60 seconds.',
            variant: 'default',
          });

          // Poll the factory contract every 5 seconds for up to 2 minutes
          let pollAttempts = 0;
          const maxPollAttempts = 24; // 24 * 5s = 2 minutes

          const pollInterval = setInterval(async () => {
            pollAttempts++;
            console.log(`🔄 Poll attempt ${pollAttempts}/${maxPollAttempts}...`);

            try {
              // Query factory contract for treasury address
              const treasuryAddress = await publicClient.readContract({
                address: POD_TREASURY_FACTORY_ADDRESS,
                abi: TREASURY_FACTORY_ABI,
                functionName: 'getTreasuryForPod',
                args: [localPod.id],
              });

              if (treasuryAddress && treasuryAddress !== '0x0000000000000000000000000000000000000000') {
                clearInterval(pollInterval);
                console.log('✅ Treasury deployed at:', treasuryAddress);

                // Update database
                const updateResponse = await fetch('/api/pods/activate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    podId: localPod.id,
                    treasuryAddress: treasuryAddress,
                    isActive: true,
                  }),
                });

                if (!updateResponse.ok) {
                  throw new Error('Failed to update pod with treasury address');
                }

                toast({
                  title: 'Treasury Deployed Successfully!',
                  description: `Treasury deployed at ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}`,
                });

                // Update local state
                setLocalPod({
                  ...localPod,
                  treasury_contract_address: treasuryAddress,
                });

                setIsTransactionPending(false);

                // Trigger refresh
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('treasury-deployed', {
                      detail: { podId: localPod.id, treasuryAddress },
                    }),
                  );
                }, 1000);
              } else if (pollAttempts >= maxPollAttempts) {
                // Timeout after 2 minutes
                clearInterval(pollInterval);
                console.error('⏱️ Treasury deployment polling timed out');
                toast({
                  title: 'Deployment Timeout',
                  description: 'Treasury deployment is taking longer than expected. Please refresh the page in a minute.',
                  variant: 'destructive',
                });
                setIsTransactionPending(false);
              }
            } catch (pollError) {
              console.error('❌ Error polling for treasury:', pollError);
              if (pollAttempts >= maxPollAttempts) {
                clearInterval(pollInterval);
                setIsTransactionPending(false);
              }
            }
          }, 5000); // Poll every 5 seconds

          return; // Exit early - polling will handle database update
        }
      }

      // Extract treasury address from transaction logs
      console.log('🏦 Processing receipt:', receipt);

      // TreasuryDeployed event signature: keccak256("TreasuryDeployed(string,address,uint256,address[],address)")
      const TREASURY_DEPLOYED_EVENT =
        '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

      let treasuryAddress = '';

      if (receipt.logs) {
        // Find TreasuryDeployed event log
        const deploymentLog = receipt.logs.find(
          (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
        );

        if (deploymentLog) {
          // Treasury address is the second indexed parameter (topics[2])
          const addressFromTopic = deploymentLog.topics?.[2];
          if (addressFromTopic && addressFromTopic.length === 66) {
            treasuryAddress = '0x' + addressFromTopic.slice(-40);
          }
        }
      }

      console.log('🏦 Extracted treasury address:', treasuryAddress);

      // If we couldn't extract the address, show error
      if (!treasuryAddress) {
        console.error('Could not extract treasury address from logs');
        toast({
          title: 'Treasury Deployed!',
          description: `Treasury deployed but address extraction failed. Check tx: ${receipt.transactionHash}`,
        });
        return;
      }

      // Update database with treasury address
      console.log('📝 Updating pod with treasury address:', treasuryAddress);
      const updateResponse = await fetch('/api/pods/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podId: localPod.id,
          treasuryAddress: treasuryAddress,
          isActive: true,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update pod with treasury address');
      }

      toast({
        title: 'Treasury Deployed Successfully!',
        description: `Treasury deployed at ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}`,
      });

      // Update the local pod object to show the treasury
      setLocalPod({
        ...localPod,
        treasury_contract_address: treasuryAddress,
      });

      // Trigger parent component refresh
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('treasury-deployed', {
            detail: { podId: localPod.id, treasuryAddress },
          }),
        );
      }, 1000);
    } catch (error: any) {
      console.error('❌ Treasury deployment failed:', error);
      console.error('🏦 Full error details:', {
        message: error?.message,
        code: error?.code,
        data: error?.data,
      });

      // 🔄 AUTOMATIC RECOVERY: If treasury already exists, fetch it from contract
      if (error?.message?.includes('Treasury already exists')) {
        console.log('🔄 Treasury already exists! Attempting automatic recovery...');

        try {
          // Query factory contract for existing treasury address
          const FACTORY_ABI = [
            {
              name: 'podTreasuries',
              type: 'function',
              inputs: [{ name: 'podId', type: 'string' }],
              outputs: [{ name: '', type: 'address' }],
              stateMutability: 'view',
            },
          ] as const;

          const existingTreasury = await publicClient.readContract({
            address: POD_TREASURY_FACTORY_ADDRESS,
            abi: FACTORY_ABI,
            functionName: 'podTreasuries',
            args: [localPod.id],
          });

          console.log('✅ Found existing treasury:', existingTreasury);

          if (
            existingTreasury &&
            existingTreasury !== '0x0000000000000000000000000000000000000000'
          ) {
            // Update database with existing treasury
            const updateResponse = await fetch('/api/pods/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                podId: localPod.id,
                treasuryAddress: existingTreasury,
                isActive: true,
              }),
            });

            if (!updateResponse.ok) {
              throw new Error('Failed to update database with existing treasury');
            }

            console.log('✅ Database updated with existing treasury');

            toast({
              title: 'Treasury Recovered!',
              description:
                'Found and linked your existing treasury: ' +
                existingTreasury.slice(0, 6) +
                '...' +
                existingTreasury.slice(-4),
            });

            // Update local state
            setLocalPod({
              ...localPod,
              treasury_contract_address: existingTreasury,
            });

            // Trigger parent refresh
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('treasury-deployed', {
                  detail: { podId: localPod.id, treasuryAddress: existingTreasury },
                }),
              );
            }, 1000);

            return; // Exit successfully
          }
        } catch (recoveryError) {
          console.error('❌ Automatic recovery failed:', recoveryError);
          toast({
            title: 'Treasury Exists But Recovery Failed',
            description:
              'A treasury already exists on-chain. Please contact support to recover it.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Extract specific error info for other errors
      let errorMessage = 'Treasury deployment encountered an error';
      if (error?.message?.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error?.message?.includes('execution reverted')) {
        errorMessage = 'Transaction reverted. Check contract permissions.';
      }

      toast({
        title: 'Deployment Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  // If pod has treasury, show regular treasury management
  if (hasTreasury) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5" style={{ color: '#3F7A5A' }} />
          <span className="font-medium" style={{ color: '#1F453A' }}>
            Treasury Active
          </span>
          {localPod.treasury_contract_address &&
            localPod.treasury_contract_address.startsWith('0x') && (
              <Badge variant="secondary" className="ml-2">
                {localPod.treasury_contract_address.slice(0, 6)}...
                {localPod.treasury_contract_address.slice(-4)}
              </Badge>
            )}
        </div>

        <TreasuryManagement
          podId={localPod.id}
          treasuryAddress={localPod.treasury_contract_address}
          podName={localPod.name}
        />
      </div>
    );
  }

  // Show deployment interface when no treasury exists
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="h-5 w-5" style={{ color: '#2F5D50' }} />
        <span className="font-medium">Treasury Deployment</span>
        <Badge variant="outline">Not Deployed</Badge>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This pod doesn't have a treasury yet. Deploy a treasury contract to
          enable fund management, token distribution, and financial operations
          for <strong>{localPod.name}</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Deploy Treasury for {localPod.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pod Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Pod ID</Label>
              <Input
                value={localPod.id}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label>Management Hat ID</Label>
              <Input
                value={localPod.management_hat_id || 'Not set'}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
          </div>

          {/* Default Supported Tokens */}
          <div>
            <Label className="text-sm font-medium">
              Default Supported Tokens
            </Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src="/images/erc20tokens/SystemToken.png"
                    alt="SYSTEM"
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">$SYSTEM</span>
                </div>
                <Badge variant="secondary">
                  {SYSTEM_TOKEN_ADDRESS.slice(0, 6)}...{SYSTEM_TOKEN_ADDRESS.slice(-4)}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src="/images/erc20tokens/SelfToken.png"
                    alt="$SELF"
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">$SELF</span>
                </div>
                <Badge variant="secondary">
                  {SELF_TOKEN_ADDRESS.slice(0, 6)}...{SELF_TOKEN_ADDRESS.slice(-4)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Deployment Transaction */}
          {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
            <div className="pt-4 border-t">
              <Button
                onClick={handleDeployViaCDP}
                disabled={isTransactionPending}
                className="w-full h-12 text-white font-semibold rounded-lg bg-[#3F7A5A] hover:bg-[#2F5D50] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTransactionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying Treasury...
                  </>
                ) : (
                  `Deploy Treasury for ${localPod.name}`
                )}
              </Button>
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please connect your Smart Wallet to deploy the treasury contract.
              </AlertDescription>
            </Alert>
          )}

          {!canManageTreasury && evmAddress && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You need treasury management permissions to deploy the treasury
                for this pod.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
