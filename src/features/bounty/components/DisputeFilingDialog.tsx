'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Scale } from 'lucide-react';
import type { FrontendBounty, FrontendBid } from '../types/bounty';

interface DisputeFilingDialogProps {
  bounty: FrontendBounty;
  bid?: FrontendBid;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (disputeId: string) => void;
}

export const DisputeFilingDialog: React.FC<DisputeFilingDialogProps> = ({
  bounty,
  bid,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { address } = useAccount();
  const [disputeType, setDisputeType] = useState<string>('');
  const [disputeTitle, setDisputeTitle] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [desiredResolution, setDesiredResolution] = useState('');
  const [priority, setPriority] = useState<
    'low' | 'medium' | 'high' | 'urgent'
  >('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  // Determine if user is creator or bidder
  const isCreator =
    address && bounty.creator_address?.toLowerCase() === address.toLowerCase();
  const isBidder =
    address && bid && bid.bidderAddress.toLowerCase() === address.toLowerCase();

  const disputeTypes = [
    {
      value: 'work_quality',
      label: 'Work Quality Issues',
      description: 'Work does not meet requirements',
    },
    {
      value: 'work_incomplete',
      label: 'Incomplete Work',
      description: 'Work is not fully completed',
    },
    {
      value: 'payment_not_released',
      label: 'Payment Not Released',
      description: 'Payment promised but not released',
    },
    {
      value: 'scope_changed',
      label: 'Scope Changed',
      description: 'Requirements changed during work',
    },
    {
      value: 'deadline_missed',
      label: 'Deadline Missed',
      description: 'Agreed deadline was not met',
    },
    {
      value: 'communication_failed',
      label: 'Communication Issues',
      description: 'Other party not responding',
    },
    {
      value: 'terms_violated',
      label: 'Terms Violated',
      description: 'Contract terms were violated',
    },
    { value: 'other', label: 'Other', description: 'Other dispute reason' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (
      !disputeType ||
      !disputeTitle.trim() ||
      !disputeDescription.trim() ||
      !desiredResolution.trim()
    ) {
      setError('Please fill in all required fields');
      return;
    }

    if (!isCreator && !isBidder) {
      setError('You must be the bounty creator or bidder to file a dispute');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const response = await fetch('/api/bounty/dispute/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountyId: bounty.id,
          bidId: bid?.id || null,
          filerAddress: address,
          disputeType,
          disputeTitle: disputeTitle.trim(),
          disputeDescription: disputeDescription.trim(),
          desiredResolution: desiredResolution.trim(),
          disputedAmount: bounty.value.amount,
          disputedToken: bounty.value.token,
          priority,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to file dispute');
      }

      console.log('✅ Dispute filed successfully:', data);

      // Close dialog and notify parent
      onOpenChange(false);
      onSuccess?.(data.dispute.id);

      // Reset form
      setDisputeType('');
      setDisputeTitle('');
      setDisputeDescription('');
      setDesiredResolution('');
      setPriority('medium');
    } catch (err) {
      console.error('❌ Error filing dispute:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to file dispute. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            style={{ color: '#C6933F' }}
          >
            <Scale className="w-5 h-5" />
            File a Dispute
          </DialogTitle>
          <DialogDescription>{bounty.title}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {/* Warning Alert */}
          <Alert
            style={{
              backgroundColor: '#FAF4EC',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#E8D7B8',
            }}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: '#C6933F' }} />
            <AlertDescription className="ml-2" style={{ color: '#8F6B2F' }}>
              <strong>Important:</strong> Filing a dispute will pause payment
              releases and notify all parties. Please ensure you have attempted
              to resolve the issue directly before filing.
            </AlertDescription>
          </Alert>

          {/* Role Information */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-sm text-gray-700">
              <strong>Your Role:</strong>{' '}
              {isCreator ? 'Bounty Creator' : isBidder ? 'Bidder' : 'Unknown'}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              <strong>Bounty Value:</strong> {bounty.value.amount}{' '}
              {bounty.value.token}
            </p>
          </div>

          {/* Dispute Type */}
          <div className="space-y-2">
            <Label htmlFor="disputeType">
              Dispute Type <span style={{ color: '#8B3A3A' }}>*</span>
            </Label>
            <Select value={disputeType} onValueChange={setDisputeType}>
              <SelectTrigger>
                <SelectValue placeholder="Select dispute type..." />
              </SelectTrigger>
              <SelectContent>
                {disputeTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-gray-500">
                        {type.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dispute Title */}
          <div className="space-y-2">
            <Label htmlFor="disputeTitle">
              Dispute Title <span style={{ color: '#8B3A3A' }}>*</span>
            </Label>
            <input
              id="disputeTitle"
              type="text"
              value={disputeTitle}
              onChange={(e) => setDisputeTitle(e.target.value)}
              placeholder="Brief summary of the issue..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={200}
            />
            <p className="text-xs text-gray-500">
              {disputeTitle.length}/200 characters
            </p>
          </div>

          {/* Dispute Description */}
          <div className="space-y-2">
            <Label htmlFor="disputeDescription">
              Detailed Description <span style={{ color: '#8B3A3A' }}>*</span>
            </Label>
            <Textarea
              id="disputeDescription"
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
              placeholder="Provide a detailed explanation of the issue, including dates, communications, and relevant context..."
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              Be specific and include all relevant details. This will be visible
              to all parties and mediators.
            </p>
          </div>

          {/* Desired Resolution */}
          <div className="space-y-2">
            <Label htmlFor="desiredResolution">
              Desired Resolution <span style={{ color: '#8B3A3A' }}>*</span>
            </Label>
            <Textarea
              id="desiredResolution"
              value={desiredResolution}
              onChange={(e) => setDesiredResolution(e.target.value)}
              placeholder="What outcome would you like to see? (e.g., full payment release, work revision, refund, etc.)"
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority Level</Label>
            <Select
              value={priority}
              onValueChange={(value: any) => setPriority(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  Low - Can wait for resolution
                </SelectItem>
                <SelectItem value="medium">
                  Medium - Normal priority (default)
                </SelectItem>
                <SelectItem value="high">
                  High - Needs attention soon
                </SelectItem>
                <SelectItem value="urgent">Urgent - Critical issue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* What Happens Next */}
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: '#E8F1EE',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#B8D9CA',
            }}
          >
            <h4
              className="font-semibold text-sm mb-2"
              style={{ color: '#1F453A' }}
            >
              What happens next:
            </h4>
            <ul
              className="list-disc list-inside space-y-1 text-sm"
              style={{ color: '#2F5D50' }}
            >
              <li>Both parties and pod leaders will be notified</li>
              <li>Payment releases will be paused pending resolution</li>
              <li>All parties can submit evidence and comments</li>
              <li>
                Pod leaders or mediators will review and propose resolutions
              </li>
              <li>Resolution will be executed once approved</li>
            </ul>
          </div>

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isSubmitting}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {isSubmitting ? 'Filing Dispute...' : 'File Dispute'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
