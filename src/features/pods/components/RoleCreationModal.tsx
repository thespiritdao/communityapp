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
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { base } from 'viem/chains';

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
                max="100"
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
                  <div
                    className="mb-4 p-3 rounded-lg text-sm"
                    style={{ backgroundColor: '#E8F1EE' }}
                  >
                    <strong>Debug Info:</strong>
                    <div>• Calls to process: {transactionCalls.length}</div>
                    <div>• Target contract: {transactionCalls[0]?.to}</div>
                    <div>
                      • Data length: {transactionCalls[0]?.data?.length || 0}{' '}
                      bytes
                    </div>
                    <div>• Chain ID: {base.id}</div>
                    <div>• Sponsored: Yes</div>
                  </div>
                  <Transaction
                    chainId={base.id}
                    calls={transactionCalls}
                    isSponsored={true}
                    onSuccess={(response) => {
                      console.log(
                        '🎉 TRANSACTION SUCCESS - OnchainKit Response:',
                        response,
                      );
                      console.log(
                        '📋 Response keys:',
                        Object.keys(response || {}),
                      );

                      if (response?.transactionReceipts) {
                        console.log(
                          '📄 Receipt count:',
                          response.transactionReceipts.length,
                        );
                        response.transactionReceipts.forEach((receipt, i) => {
                          console.log(`📄 Receipt ${i}:`, {
                            hash: receipt.transactionHash,
                            status: receipt.status,
                            logCount: receipt.logs?.length || 0,
                            gasUsed: receipt.gasUsed?.toString(),
                          });
                        });
                      }

                      onTransactionSuccess?.(response);
                    }}
                    onError={(error) => {
                      console.error(
                        '❌ TRANSACTION ERROR - OnchainKit Error:',
                        error,
                      );
                      console.log('🚨 Error details:', {
                        name: (error as any)?.name,
                        message: error?.message,
                        cause: (error as any)?.cause,
                        code: error?.code,
                      });
                      onTransactionError?.(error);
                    }}
                  >
                    <TransactionButton text="Create Role" />
                    <TransactionSponsor />
                    <TransactionStatus>
                      <TransactionStatusLabel />
                      <TransactionStatusAction />
                    </TransactionStatus>
                  </Transaction>
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
