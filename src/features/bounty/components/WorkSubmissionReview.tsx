'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ExternalLink, CheckCircle, XCircle, Edit } from 'lucide-react';
import { format } from 'date-fns';
import type { FrontendWorkSubmission, FrontendBounty } from '../types/bounty';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

interface WorkSubmissionReviewProps {
  podId: string;
  onReviewComplete?: () => void;
}

export const WorkSubmissionReview: React.FC<WorkSubmissionReviewProps> = ({
  podId,
  onReviewComplete,
}) => {
  const { address } = useAccount();
  const [submissions, setSubmissions] = useState<FrontendWorkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedSubmission, setSelectedSubmission] =
    useState<FrontendWorkSubmission | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewComments, setReviewComments] = useState('');
  const [reviewAction, setReviewAction] = useState<
    'approved' | 'rejected' | 'revision_requested'
  >('approved');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (podId) {
      loadSubmissions();
    }
  }, [podId]);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError('');

      console.log(`🔍 Loading work submissions for pod: ${podId}`);
      const response = await fetch(`/api/bounty/work/submit?podId=${podId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load submissions');
      }

      // Transform database format to frontend format
      const transformedSubmissions = data.submissions.map((sub: any) => ({
        id: sub.id,
        bountyId: sub.bounty_id,
        bidId: sub.bid_id,
        submitterAddress: sub.submitter_address,
        submissionTitle: sub.submission_title,
        submissionDescription: sub.submission_description,
        deliverableUrls: sub.deliverable_urls || [],
        attachmentUrls: sub.attachment_urls || [],
        completedDeliverables: sub.completed_deliverables || [],
        status: sub.status,
        reviewerAddress: sub.reviewer_address,
        reviewComments: sub.review_comments,
        reviewedAt: sub.reviewed_at ? new Date(sub.reviewed_at) : undefined,
        revisionNumber: sub.revision_number,
        previousSubmissionId: sub.previous_submission_id,
        createdAt: new Date(sub.created_at),
        updatedAt: new Date(sub.updated_at),
      }));

      setSubmissions(transformedSubmissions);
    } catch (err) {
      console.error('❌ Error loading submissions:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load submissions',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = (
    submission: FrontendWorkSubmission,
    action: 'approved' | 'rejected' | 'revision_requested',
  ) => {
    setSelectedSubmission(submission);
    setReviewAction(action);
    setReviewComments('');
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!address || !selectedSubmission) return;

    try {
      setIsSubmitting(true);
      setError('');

      const response = await fetch('/api/bounty/work/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: selectedSubmission.id,
          reviewerAddress: address,
          status: reviewAction,
          reviewComments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit review');
      }

      console.log('✅ Review submitted successfully');
      setReviewDialogOpen(false);
      setSelectedSubmission(null);
      await loadSubmissions();
      onReviewComplete?.();
    } catch (err) {
      console.error('❌ Error submitting review:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending Review</Badge>;
      case 'approved':
        return (
          <Badge style={{ backgroundColor: '#D1E6DC', color: '#1F453A' }}>
            Approved
          </Badge>
        );
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'revision_requested':
        return (
          <Badge style={{ backgroundColor: '#FAF4EC', color: '#8F6B2F' }}>
            Revision Requested
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div
              className="animate-spin rounded-full h-8 w-8"
              style={{
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: '#2F5D50',
              }}
            ></div>
            <span className="ml-2">Loading submissions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-gray-600 text-center">No work submissions yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Work Submissions</h2>

      {error && (
        <Alert
          style={{
            backgroundColor: '#F5E6E6',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#D9B3B3',
          }}
        >
          <AlertDescription style={{ color: '#5C1F1F' }}>
            {error}
          </AlertDescription>
        </Alert>
      )}

      {submissions.map((submission) => (
        <Card key={submission.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <CardTitle className="text-lg">
                  {submission.submissionTitle}
                </CardTitle>
                <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                  <span>Submitted by:</span>
                  <UserProfileDisplay
                    walletAddress={submission.submitterAddress}
                    size="sm"
                    showModal={true}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  {format(submission.createdAt, 'MMM dd, yyyy HH:mm')} •
                  Revision #{submission.revisionNumber}
                </p>
              </div>
              {getStatusBadge(submission.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Description */}
            <div>
              <h4 className="font-medium text-sm mb-2">Description</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {submission.submissionDescription}
              </p>
            </div>

            {/* Deliverable URLs */}
            {submission.deliverableUrls.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Deliverables</h4>
                <div className="space-y-2">
                  {submission.deliverableUrls.map((deliverable, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm"
                    >
                      <strong>{deliverable.label}:</strong>
                      <a
                        href={deliverable.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                        style={{ color: '#2F5D50' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {deliverable.url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachment URLs */}
            {submission.attachmentUrls.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">
                  Additional Attachments
                </h4>
                <div className="space-y-1">
                  {submission.attachmentUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm flex items-center gap-1"
                      style={{ color: '#2F5D50' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      {url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Review Comments (if reviewed) */}
            {submission.reviewComments && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-sm mb-2">Review Feedback</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {submission.reviewComments}
                </p>
                {submission.reviewedAt && (
                  <p className="text-xs text-gray-500 mt-2">
                    Reviewed on{' '}
                    {format(submission.reviewedAt, 'MMM dd, yyyy HH:mm')}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons (only for pending submissions) */}
            {submission.status === 'pending' && (
              <div className="space-y-2 pt-4">
                {/* Request Revision - Full Width */}
                <Button
                  onClick={() =>
                    handleReviewClick(submission, 'revision_requested')
                  }
                  variant="outline"
                  className="w-full"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Request Revision
                </Button>

                {/* Approve and Reject - Side by Side */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleReviewClick(submission, 'approved')}
                    className="flex-1"
                    style={{ backgroundColor: '#3F7A5A', color: '#FFFFFF' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2F5D50';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#3F7A5A';
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleReviewClick(submission, 'rejected')}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' && 'Approve Work Submission'}
              {reviewAction === 'rejected' && 'Reject Work Submission'}
              {reviewAction === 'revision_requested' && 'Request Revision'}
            </DialogTitle>
            <DialogDescription>
              {selectedSubmission &&
                `Review submission: "${selectedSubmission.submissionTitle}"`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <div>
              <Label htmlFor="reviewComments">
                {reviewAction === 'approved'
                  ? 'Approval Comments (Optional)'
                  : 'Comments *'}
              </Label>
              <Textarea
                id="reviewComments"
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder={
                  reviewAction === 'approved'
                    ? 'Leave positive feedback for the contributor...'
                    : reviewAction === 'rejected'
                      ? 'Explain why this submission is being rejected...'
                      : 'Describe what needs to be revised...'
                }
                rows={4}
                required={reviewAction !== 'approved'}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setReviewDialogOpen(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitReview}
                disabled={
                  isSubmitting ||
                  (reviewAction !== 'approved' && !reviewComments.trim())
                }
                className="flex-1"
                style={{
                  backgroundColor:
                    reviewAction === 'approved'
                      ? '#D1E6DC'
                      : reviewAction === 'rejected'
                        ? '#F5E6E6'
                        : '#FAF4EC',
                  color: '#000',
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
