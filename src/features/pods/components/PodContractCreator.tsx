'use client';

import { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { debugTransactionCalls } from '../utils/transactionDebugger';
import { Loader2 } from 'lucide-react';

// PodCreationManager ABI for creating pods
const POD_CREATION_MANAGER_ABI = [
  {
    name: 'createPodProposal',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'podLeads', type: 'address[]' },
      { name: 'parentHatId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'activatePod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const POD_CREATION_MANAGER_ADDRESS =
  '0x43C124Df0dFb324CCC742808D9FdF62C764f2644';

interface PodContractCreatorProps {
  onPodCreated?: (podId: string) => void;
}

export function PodContractCreator({ onPodCreated }: PodContractCreatorProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const [step, setStep] = useState<'propose' | 'activate'>('propose');
  const [formData, setFormData] = useState({
    podId: 'executive-pod',
    name: 'Executive Pod',
    description:
      'Main executive leadership pod for DAO governance and operations',
    imageURI: 'https://example.com/executive-pod.png',
    podLeads: '', // comma-separated addresses
    parentHatId:
      '3666552746732487012074714051834669771614651641465517857430090993893376', // Executive Hat ID in decimal (0x0000008800000000...)
  });
  const [createdPodId, setCreatedPodId] = useState<string>('');
  const [isProposing, setIsProposing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // CDP-based pod proposal handler
  const handleCreateProposal = async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      console.error('Smart Account not found');
      return;
    }

    setIsProposing(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];

      // Parse pod leads
      const podLeadsArray = formData.podLeads
        .split(',')
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0)
        .filter((addr) => /^0x[a-fA-F0-9]{40}$/.test(addr));

      if (podLeadsArray.length === 0) {
        podLeadsArray.push(address!); // Add current user as default pod lead
      }

      console.log('🏗️ Creating pod proposal via CDP:', {
        podId: formData.podId,
        name: formData.name,
        podLeads: podLeadsArray,
      });

      const callData = encodeFunctionData({
        abi: POD_CREATION_MANAGER_ABI,
        functionName: 'createPodProposal',
        args: [
          formData.podId,
          formData.name,
          formData.description,
          formData.imageURI,
          podLeadsArray as `0x${string}`[],
          BigInt(formData.parentHatId),
        ],
      });

      await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: POD_CREATION_MANAGER_ADDRESS as `0x${string}`,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Pod proposal created successfully');
      setCreatedPodId(formData.podId);
      setStep('activate');
      onPodCreated?.(formData.podId);
    } catch (error: any) {
      console.error('❌ Pod proposal creation failed:', error);
    } finally {
      setIsProposing(false);
    }
  };

  // CDP-based pod activation handler
  const handleActivatePod = async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      console.error('Smart Account not found');
      return;
    }

    setIsActivating(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      const targetPodId = createdPodId || formData.podId;

      console.log('🏗️ Activating pod via CDP:', {
        podId: targetPodId,
      });

      const callData = encodeFunctionData({
        abi: POD_CREATION_MANAGER_ABI,
        functionName: 'activatePod',
        args: [targetPodId],
      });

      await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: POD_CREATION_MANAGER_ADDRESS as `0x${string}`,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Pod activated successfully');
      // Pod is now active with treasury deployed
    } catch (error: any) {
      console.error('❌ Pod activation failed:', error);
    } finally {
      setIsActivating(false);
    }
  };

  if (!address) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to create pods in the contract.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Pod in Smart Contract</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your pods exist in the database but need to be created in the smart
            contract first.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'propose' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="podId">Pod ID</Label>
                  <Input
                    id="podId"
                    value={formData.podId}
                    onChange={(e) => handleInputChange('podId', e.target.value)}
                    placeholder="executive-pod"
                  />
                </div>
                <div>
                  <Label htmlFor="name">Pod Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Executive Pod"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange('description', e.target.value)
                  }
                  placeholder="Pod description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="imageURI">Image URI</Label>
                  <Input
                    id="imageURI"
                    value={formData.imageURI}
                    onChange={(e) =>
                      handleInputChange('imageURI', e.target.value)
                    }
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="parentHatId">Parent Hat ID</Label>
                  <Input
                    id="parentHatId"
                    value={formData.parentHatId}
                    onChange={(e) =>
                      handleInputChange('parentHatId', e.target.value)
                    }
                    placeholder="1"
                    type="number"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="podLeads">
                  Pod Leads (comma-separated addresses)
                </Label>
                <Input
                  id="podLeads"
                  value={formData.podLeads}
                  onChange={(e) =>
                    handleInputChange('podLeads', e.target.value)
                  }
                  placeholder="0x..., 0x..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to use your address as default pod lead
                </p>
              </div>

              <div className="pt-4">
                <Button
                  onClick={handleCreateProposal}
                  disabled={isProposing}
                  className="w-full"
                >
                  {isProposing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Proposal...
                    </>
                  ) : (
                    'Create Pod Proposal'
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'activate' && (
            <div className="space-y-4">
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: '#D1E6DC' }}
              >
                <p className="font-medium" style={{ color: '#1F453A' }}>
                  ✅ Pod Proposal Created!
                </p>
                <p className="text-sm" style={{ color: '#2F5D50' }}>
                  Pod ID: {createdPodId}
                </p>
                <p className="text-sm" style={{ color: '#2F5D50' }}>
                  Status: Proposed
                </p>
              </div>

              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <p className="font-medium" style={{ color: '#1F453A' }}>
                  Next Step: Activate Pod
                </p>
                <p className="text-sm" style={{ color: '#2F5D50' }}>
                  This will create the membership hat and deploy the treasury
                  contract.
                </p>
              </div>

              <Button
                onClick={handleActivatePod}
                disabled={isActivating}
                className="w-full"
              >
                {isActivating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating Pod...
                  </>
                ) : (
                  'Activate Pod & Deploy Treasury'
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep('propose')}
              >
                Back to Create Another Pod
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Information */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs font-mono space-y-1">
            <p>
              <strong>Contract:</strong> {POD_CREATION_MANAGER_ADDRESS}
            </p>
            <p>
              <strong>Current Step:</strong> {step}
            </p>
            <p>
              <strong>User:</strong> {address}
            </p>
            <p>
              <strong>Pod ID:</strong> {formData.podId}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
