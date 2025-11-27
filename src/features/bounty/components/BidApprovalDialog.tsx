/**
 * BidApprovalDialog Component
 *
 * Pure UI component for displaying bid details and collecting reviewer assignments.
 * This component is PRESENTATION ONLY - all business logic handled by BidApprovalFlow.
 *
 * RESPONSIBILITIES:
 * - Display bid details (experience, plan, deliverables, timeline)
 * - Collect technical reviewer and final approver assignments
 * - Validate reviewer selection (but not bid data)
 * - Trigger approval action when ready
 *
 * DOES NOT:
 * - Handle transactions
 * - Update database
 * - Send notifications
 * - Validate on-chain state
 *
 * @module BidApprovalDialog
 */

'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { format, parseISO, isValid } from 'date-fns';
import { CheckCircle } from 'lucide-react';
import UserTagging from '@/components/UserTagging';
import { isAddress } from 'viem';
import type { FrontendBid } from '../types/bounty';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BidApprovalDialogProps {
  /** Whether dialog is open */
  open: boolean;

  /** Callback to close dialog */
  onClose: () => void;

  /** Bid being reviewed */
  bid: FrontendBid;

  /** Bounty title for display */
  bountyTitle: string;

  /** Token symbol for display (e.g., "$SYSTEM", "$SELF") */
  tokenSymbol: string;

  /** Callback triggered when user approves bid with reviewers selected */
  onApprove: (
    techReviewer: `0x${string}`,
    finalApprover: `0x${string}`,
  ) => void;

  /** Whether approval is currently in progress */
  isApproving?: boolean;

  /** Whether to show read-only view (bid already approved) */
  readOnly?: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts Ethereum address from mention string
 * Format: "@[Name](0xAddress)" or just "0xAddress"
 */
const extractAddress = (mention: string | undefined): `0x${string}` | null => {
  if (!mention) return null;
  const match = mention.match(/@\[.*?\]\((0x[a-fA-F0-9]{40})\)/);
  const address = match ? match[1] : mention;
  return isAddress(address) ? (address as `0x${string}`) : null;
};

/**
 * Formats payment option label for display
 */
const getPaymentOptionLabel = (option: string): string => {
  switch (option) {
    case 'completion':
      return 'Pay on Completion';
    case 'milestones':
      return 'Pay per Milestone';
    case 'split':
      return 'Split Payment';
    default:
      return option;
  }
};

/**
 * Formats date for deliverable display
 */
const formatDeliverableDate = (dateValue: string | Date): string => {
  const dateObj =
    typeof dateValue === 'string' ? parseISO(dateValue) : dateValue;
  return isValid(dateObj) ? format(dateObj, 'MMM dd, yyyy') : 'Invalid date';
};

// ============================================================================
// COMPONENT
// ============================================================================

export const BidApprovalDialog: React.FC<BidApprovalDialogProps> = ({
  open,
  onClose,
  bid,
  bountyTitle,
  tokenSymbol,
  onApprove,
  isApproving = false,
  readOnly = false,
}) => {
  const [techReviewer, setTechReviewer] = useState<string>('');
  const [finalApprover, setFinalApprover] = useState<string>('');

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const techReviewerAddress = extractAddress(techReviewer);
  const finalApproverAddress = extractAddress(finalApprover);

  const hasBothReviewers = techReviewerAddress && finalApproverAddress;
  const canApprove = hasBothReviewers && !isApproving && !readOnly;

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleApprove = () => {
    if (!techReviewerAddress || !finalApproverAddress) {
      console.error('Cannot approve: Missing reviewer addresses');
      return;
    }

    onApprove(techReviewerAddress, finalApproverAddress);
  };

  const handleClose = () => {
    if (isApproving) {
      // Don't allow closing during approval
      return;
    }
    onClose();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-5xl">
        <DialogHeader>
          <DialogTitle>{readOnly ? 'Bid Details' : 'Bid Approval'}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'View the approved bid details and assigned reviewers.'
              : 'Review the bid details and assign reviewers before approval.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
          {/* Bid Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">{bountyTitle}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <p>
                <strong>Bidder:</strong>{' '}
                {bid.first_name || bid.last_name
                  ? `${bid.first_name || ''} ${bid.last_name || ''}`.trim()
                  : bid.bidderAddress}
              </p>
              <p>
                <strong>Amount:</strong> {bid.proposedAmount} {tokenSymbol}
              </p>
              <p>
                <strong>Payment:</strong>{' '}
                {getPaymentOptionLabel(bid.paymentOption)}
              </p>
              <p>
                <strong>Submitted:</strong>{' '}
                {format(bid.submittedAt, 'MMM dd, yyyy')}
              </p>
            </div>
          </div>

          {/* Experience */}
          <div>
            <h4 className="font-medium mb-2">Relevant Experience</h4>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">
                {bid.experience}
              </p>
            </div>
          </div>

          {/* Plan of Action */}
          <div>
            <h4 className="font-medium mb-2">Plan of Action</h4>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">
                {bid.planOfAction}
              </p>
            </div>
          </div>

          {/* Deliverables */}
          <div>
            <h4 className="font-medium mb-2">Deliverables</h4>
            <div className="space-y-2">
              {Array.isArray(bid.deliverables) &&
              bid.deliverables.length > 0 ? (
                bid.deliverables.map((deliverable, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div className="flex-grow">
                        <p className="text-gray-700">
                          {deliverable.description}
                        </p>
                        <div className="text-sm text-gray-600 mt-1">
                          <p>
                            Due: {formatDeliverableDate(deliverable.due_date)}
                          </p>
                          <p>
                            Amount: {deliverable.payment_amount} {tokenSymbol}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-500 italic">
                    No deliverables specified
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="font-medium mb-2">Timeline</h4>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">
                {bid.timeline}
              </p>
            </div>
          </div>

          {/* Reviewer Assignment */}
          <div className="space-y-4">
            <div>
              <Label>Technical Reviewer {readOnly && '(Assigned)'}</Label>
              {readOnly ? (
                <div className="p-2 bg-gray-100 rounded border text-gray-700">
                  {bid.technical_reviewer || 'Not assigned'}
                </div>
              ) : (
                <UserTagging
                  value={techReviewer}
                  onChange={setTechReviewer}
                  placeholder="Type @ to mention a technical reviewer..."
                  contextType="bounty"
                  contextId={bid.bountyId}
                  contextUrl={`/bounty/${bid.bountyId}`}
                />
              )}
              {!readOnly && techReviewer && !techReviewerAddress && (
                <p className="text-sm mt-1" style={{ color: '#8B3A3A' }}>
                  Invalid Ethereum address
                </p>
              )}
            </div>

            <div>
              <Label>Final Approver {readOnly && '(Assigned)'}</Label>
              {readOnly ? (
                <div className="p-2 bg-gray-100 rounded border text-gray-700">
                  {bid.final_approver || 'Not assigned'}
                </div>
              ) : (
                <UserTagging
                  value={finalApprover}
                  onChange={setFinalApprover}
                  placeholder="Type @ to mention a final approver..."
                  contextType="bounty"
                  contextId={bid.bountyId}
                  contextUrl={`/bounty/${bid.bountyId}`}
                />
              )}
              {!readOnly && finalApprover && !finalApproverAddress && (
                <p className="text-sm mt-1" style={{ color: '#8B3A3A' }}>
                  Invalid Ethereum address
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={handleClose}
              variant="outline"
              disabled={isApproving}
            >
              {readOnly ? 'Close' : 'Cancel'}
            </Button>

            {!readOnly && (
              <Button
                onClick={handleApprove}
                disabled={!canApprove}
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {isApproving ? 'Approving...' : 'Approve & Create Bounty'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BidApprovalDialog;
