/**
 * Example integration of multi-signature bounty approval system
 *
 * This shows how to integrate the new multi-sig functionality into existing bounty pages
 */

'use client';

import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BountyFormV2 } from '../components/BountyFormV2';
import { BountyApprovalFlow } from '../components/BountyApprovalFlow';
import { useBountyMultiSig } from '../hooks/useBountyMultiSig';
import { useToast } from '@/components/ui/use-toast';
import type { FrontendBounty } from '../types/bounty';

export const BountyPageWithMultiSig: React.FC = () => {
  const { toast } = useToast();
  const {
    createBountyWithApproval,
    requiresApproval,
    approvalWorkflowId,
    clearApprovalState,
  } = useBountyMultiSig();

  const [createdBounty, setCreatedBounty] = useState<FrontendBounty | null>(
    null,
  );
  const [showApprovalFlow, setShowApprovalFlow] = useState(false);

  // Handle bounty creation with automatic multi-sig detection
  const handleBountySubmit = async (
    bountyData: Omit<
      FrontendBounty,
      'id' | 'createdAt' | 'onchain_id' | 'status'
    >,
  ) => {
    try {
      const result = await createBountyWithApproval(bountyData);

      if (result.requiresApproval) {
        // High-value bounty - show approval workflow
        setCreatedBounty(result.bounty!);
        setShowApprovalFlow(true);

        toast({
          title: 'Approval Workflow Created',
          description:
            'Your high-value bounty requires manager approval. You can track the approval process below.',
        });
      } else {
        // Low-value bounty - created directly
        setCreatedBounty(result.bounty!);

        toast({
          title: 'Bounty Created Successfully',
          description: 'Your bounty is now live and accepting bids.',
        });
      }
    } catch (error) {
      console.error('Failed to create bounty:', error);
      toast({
        title: 'Creation Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Handle approval completion
  const handleApprovalComplete = (workflowId: string) => {
    toast({
      title: 'Bounty Approved!',
      description:
        'Your bounty has been approved by the required managers and is now active.',
    });

    // Optionally hide approval flow and show success state
    setShowApprovalFlow(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create New Bounty</h1>

        {/* Bounty Creation Form */}
        {!createdBounty && (
          <Card>
            <CardHeader>
              <CardTitle>Bounty Details</CardTitle>
            </CardHeader>
            <CardContent>
              <BountyFormV2
                onSuccess={(bountyId) => {
                  console.log('Bounty created with ID:', bountyId);
                }}
                categories={['Development', 'Design', 'Marketing', 'Research']}
              />
            </CardContent>
          </Card>
        )}

        {/* Show created bounty info */}
        {createdBounty && (
          <Card
            style={{ backgroundColor: '#D1E6DC', border: '1px solid #B8D9CA' }}
          >
            <CardHeader>
              <CardTitle style={{ color: '#1F453A' }}>
                {requiresApproval
                  ? 'Bounty Created - Awaiting Approval'
                  : 'Bounty Created Successfully'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-green-700">
                <div>
                  <strong>Title:</strong> {createdBounty.title}
                </div>
                <div>
                  <strong>Value:</strong> ${createdBounty.value.amount}{' '}
                  {createdBounty.value.token}
                </div>
                <div>
                  <strong>Status:</strong> {createdBounty.status}
                </div>
                {requiresApproval && (
                  <div className="text-sm text-green-600 mt-2">
                    This bounty requires manager approval before going live.
                    Track the approval progress below.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Multi-Signature Approval Flow */}
        {showApprovalFlow && createdBounty && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Approval Process</h2>
            <BountyApprovalFlow
              bountyId={createdBounty.id as number}
              bountyTitle={createdBounty.title}
              bountyValue={`$${createdBounty.value.amount}`}
              onApprovalComplete={handleApprovalComplete}
            />
          </div>
        )}

        {/* Reset button for demo */}
        {createdBounty && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                setCreatedBounty(null);
                setShowApprovalFlow(false);
                clearApprovalState();
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Create Another Bounty
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BountyPageWithMultiSig;
