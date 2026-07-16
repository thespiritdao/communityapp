import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';

interface RoleCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (roleData: {
    name: string;
    description: string;
    maxSupply: number;
  }) => Promise<void>;
  transactionCalls?: any[];
  isTransactionReady?: boolean;
  roleData?: { name: string; description: string; maxSupply: number };
  onTransactionSuccess?: (response: any) => void;
  onTransactionError?: (error: any) => void;
}

export function RoleCreationModal({
  isOpen,
  onClose,
  onSubmit,
  transactionCalls,
  isTransactionReady,
  roleData,
  onTransactionSuccess,
  onTransactionError,
}: RoleCreationModalProps) {
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [maxSupply, setMaxSupply] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CDP hooks for transaction execution
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const [isCreating, setIsCreating] = useState(false);

  // DEBUG: Log CDP wallet status to identify why button is disabled
  React.useEffect(() => {
    if (isTransactionReady) {
      console.log('🔍 RoleCreationModal - CDP Wallet Status:', {
        hasEvmAddress: !!evmAddress,
        evmAddress,
        hasCurrentUser: !!currentUser,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
        smartAccountAddress: currentUser?.evmSmartAccounts?.[0],
        hasSendUserOperation: !!sendUserOperation,
        isTransactionReady,
        hasTransactionCalls: !!transactionCalls,
        transactionCallsCount: transactionCalls?.length || 0,
      });

      // Show user-friendly message if wallet not ready
      if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
        console.warn('⚠️ Button disabled: Missing CDP wallet requirements');
        console.warn('   - EVM Address:', evmAddress || 'MISSING');
        console.warn('   - Smart Account:', currentUser?.evmSmartAccounts?.[0] || 'MISSING');
      }
    }
  }, [isTransactionReady, evmAddress, currentUser, transactionCalls, sendUserOperation]);

  // Reset form when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setRoleName('');
      setRoleDescription('');
      setMaxSupply('5');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roleName.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: roleName,
        description: roleDescription,
        maxSupply: Number.parseInt(maxSupply, 10) || 1,
      });

      // Don't close modal - let parent handle state
      // Modal will transition to transaction view
    } catch (error) {
      console.error('Failed to create role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] w-[85%] max-h-[90vh] overflow-y-auto p-8 pb-24">
        <DialogHeader>
          <DialogTitle>
            {isTransactionReady ? 'Complete Role Creation' : 'Create New Role'}
          </DialogTitle>
          <DialogDescription>
            {isTransactionReady
              ? 'Your transaction is ready. Click the button below to create the role on-chain.'
              : 'Create a new role for your pod. Roles help organize permissions and responsibilities.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4 pb-6">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name *</Label>
              <Input
                id="role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g., Treasury Manager, Content Creator"
                required={true}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                placeholder="Describe the responsibilities and permissions for this role..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-supply">Maximum Members</Label>
              <Input
                id="max-supply"
                type="number"
                min="1"
                max="10000"
                value={maxSupply}
                onChange={(e) => setMaxSupply(e.target.value)}
                placeholder="5"
              />
              <p className="text-sm text-gray-500">
                Maximum number of members who can hold this role simultaneously
              </p>
            </div>
          </div>

          {isTransactionReady ? (
            <div className="pt-4 pb-8">
              {roleData && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Role to be created:</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Name:</strong> {roleData.name}
                    </p>
                    <p>
                      <strong>Description:</strong> {roleData.description}
                    </p>
                    <p>
                      <strong>Max Members:</strong> {roleData.maxSupply}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-6">
                Transaction prepared! Click the button below to create the role
                on-chain.
              </p>
              {transactionCalls && (
                <div className="mb-8">
                  <Button
                    onClick={async () => {
                      if (!transactionCalls || !evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
                        console.error('❌ Missing CDP requirements:', {
                          hasTransactionCalls: !!transactionCalls,
                          hasEvmAddress: !!evmAddress,
                          hasCurrentUser: !!currentUser,
                          hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
                          evmAddress,
                          smartAccountAddress: currentUser?.evmSmartAccounts?.[0],
                        });
                        return;
                      }

                      const smartAccount = currentUser.evmSmartAccounts[0];

                      setIsCreating(true);
                      try {
                        console.log('🚀 Creating role via CDP Smart Account:', {
                          evmAddress,
                          smartAccount,
                          callsCount: transactionCalls.length,
                        });

                        const response = await sendUserOperation({
                          evmSmartAccount: smartAccount,
                          network: 'base',
                          calls: transactionCalls.map((call: any) => ({
                            to: call.to,
                            data: call.data,
                            value: call.value || 0n,
                          })),
                          useCdpPaymaster: true,
                        });

                        console.log('✅ User operation sent successfully!', response);

                        // CDP SDK returns userOperationHash, not immediate receipt
                        const resultWithHash = response as any;
                        const txHash = resultWithHash?.userOperationHash;

                        if (txHash) {
                          console.log('✅ Role creation submitted, userOperationHash:', txHash);

                          // Call success handler with userOperationHash as transaction hash
                          const successResponse = {
                            transactionReceipts: [{
                              transactionHash: txHash,
                            }],
                          };
                          onTransactionSuccess?.(successResponse);
                        } else {
                          console.warn('⚠️ No userOperationHash found in result');
                          throw new Error('Transaction submitted but no hash found');
                        }

                      } catch (error) {
                        console.error('❌ Role creation failed:', error);
                        onTransactionError?.(error);
                      } finally {
                        setIsCreating(false);
                      }
                    }}
                    disabled={isCreating || !evmAddress || !currentUser?.evmSmartAccounts?.[0]}
                    className="w-full"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Role...
                      </>
                    ) : (
                      'Create Role'
                    )}
                  </Button>

                  {isCreating && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <div>
                          <p className="font-semibold">Transaction in Progress</p>
                          <p className="text-xs mt-1">
                            Creating role oonchain... This may take 10-30 seconds.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(!evmAddress || !currentUser?.evmSmartAccounts?.[0]) && (
                    <div className="mt-2 text-sm text-red-600">
                      ⚠️ CDP Smart Account not ready. Please ensure your wallet is fully connected.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-end gap-2 pt-6 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !roleName.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  'Prepare Transaction'
                )}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
