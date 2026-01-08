// src/features/forum/components/ReportButton.tsx

'use client';

import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { submitReport } from '../services/ModerationService';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReportButtonProps {
  targetType: 'thread' | 'post';
  targetId: string;
  threadId?: string; // Required if targetType is 'post'
}

export function ReportButton({
  targetType,
  targetId,
  threadId,
}: ReportButtonProps) {
  const { evmAddress: address } = useEvmAddress();
  const [isOpen, setIsOpen] = useState(false);
  const [reportType, setReportType] = useState<
    'spam' | 'abuse' | 'off-topic' | 'harassment' | 'other'
  >('spam');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!address) {
    return null;
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await submitReport(
        address,
        reportType,
        description,
        targetType === 'post' ? targetId : undefined,
        targetType === 'thread' ? targetId : threadId,
      );

      if (result.success) {
        alert('Report submitted successfully. Moderators will review it.');
        setIsOpen(false);
        setDescription('');
        setReportType('spam');
      } else {
        alert(`Failed to submit report: ${result.error}`);
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-gray-700"
        >
          🚩 Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Report {targetType === 'thread' ? 'Thread' : 'Post'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="reportType">Report Type</Label>
            <Select
              value={reportType}
              onValueChange={(val: any) => setReportType(val)}
            >
              <SelectTrigger id="reportType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="abuse">Abuse</SelectItem>
                <SelectItem value="off-topic">Off-Topic</SelectItem>
                <SelectItem value="harassment">Harassment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Please describe the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
