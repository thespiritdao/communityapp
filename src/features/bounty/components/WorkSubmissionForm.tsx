'use client';

import React, { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { getAuthHeaders } from '@/lib/authHeaders';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Plus, X, ExternalLink, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type {
  FrontendBid,
  FrontendBounty,
  DeliverableUrl,
} from '../types/bounty';

interface WorkSubmissionFormProps {
  bounty: FrontendBounty;
  bid: FrontendBid;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const WorkSubmissionForm: React.FC<WorkSubmissionFormProps> = ({
  bounty,
  bid,
  onSuccess,
  onCancel,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [existingSubmission, setExistingSubmission] = useState<any>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  const [formData, setFormData] = useState({
    submissionTitle: '',
    submissionDescription: '',
    deliverableUrls: [{ label: '', url: '' }] as DeliverableUrl[],
    attachmentUrls: [''],
    completedDeliverables: [] as string[],
  });

  // Fetch existing submission on mount to check for review feedback
  useEffect(() => {
    const fetchExistingSubmission = async () => {
      if (!bid.id) {
        setLoadingExisting(false);
        return;
      }

      try {
        const response = await fetch(`/api/bounty/work/submit?bidId=${bid.id}`, {
          headers: await getAuthHeaders(),
        });
        const data = await response.json();

        if (response.ok && data.submissions && data.submissions.length > 0) {
          // Get the most recent submission
          const latest = data.submissions[0];
          setExistingSubmission(latest);

          // If submission needs revision, user can edit and resubmit
          console.log('📋 Found existing submission:', latest);
        }
      } catch (err) {
        console.error('Error fetching existing submission:', err);
      } finally {
        setLoadingExisting(false);
      }
    };

    fetchExistingSubmission();
  }, [bid.id]);

  // Add deliverable URL field
  const addDeliverableUrl = () => {
    setFormData((prev) => ({
      ...prev,
      deliverableUrls: [...prev.deliverableUrls, { label: '', url: '' }],
    }));
  };

  // Remove deliverable URL field
  const removeDeliverableUrl = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      deliverableUrls: prev.deliverableUrls.filter((_, i) => i !== index),
    }));
  };

  // Update deliverable URL
  const updateDeliverableUrl = (
    index: number,
    field: 'label' | 'url',
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      deliverableUrls: prev.deliverableUrls.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  // Add attachment URL field
  const addAttachmentUrl = () => {
    setFormData((prev) => ({
      ...prev,
      attachmentUrls: [...prev.attachmentUrls, ''],
    }));
  };

  // Remove attachment URL field
  const removeAttachmentUrl = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      attachmentUrls: prev.attachmentUrls.filter((_, i) => i !== index),
    }));
  };

  // Update attachment URL
  const updateAttachmentUrl = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      attachmentUrls: prev.attachmentUrls.map((item, i) =>
        i === index ? value : item,
      ),
    }));
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.submissionTitle.trim()) {
      setError('Submission title is required');
      return false;
    }

    if (!formData.submissionDescription.trim()) {
      setError('Submission description is required');
      return false;
    }

    // Check if at least one deliverable URL is provided
    const hasValidDeliverable = formData.deliverableUrls.some(
      (d) => d.label.trim() && d.url.trim(),
    );

    if (!hasValidDeliverable) {
      setError('At least one deliverable with label and URL is required');
      return false;
    }

    return true;
  };

  // Submit work
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);

      // Filter out empty deliverable URLs and attachment URLs
      const deliverableUrls = formData.deliverableUrls.filter(
        (d) => d.label.trim() && d.url.trim(),
      );
      const attachmentUrls = formData.attachmentUrls.filter((url) =>
        url.trim(),
      );

      const response = await fetch('/api/bounty/work/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({
          bountyId: bounty.id,
          bidId: bid.id,
          submitterAddress: address,
          submissionTitle: formData.submissionTitle,
          submissionDescription: formData.submissionDescription,
          deliverableUrls,
          attachmentUrls,
          completedDeliverables: formData.completedDeliverables,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit work');
      }

      console.log('✅ Work submitted successfully:', data.submission);
      onSuccess?.();
    } catch (err) {
      console.error('❌ Error submitting work:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to submit work. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Loading Indicator */}
          {loadingExisting && (
            <div className="flex items-center justify-center p-4">
              <div
                className="animate-spin rounded-full h-6 w-6"
                style={{
                  borderBottomWidth: '2px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: '#2F5D50',
                }}
              ></div>
              <span className="ml-2 text-sm text-gray-600">
                Checking for previous submissions...
              </span>
            </div>
          )}

          {/* Existing Submission Status - Pending */}
          {!loadingExisting && existingSubmission && existingSubmission.status === 'pending' && (
            <Alert
              style={{
                backgroundColor: '#FFF9E6',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#E6D89F',
              }}
            >
              <AlertCircle className="h-4 w-4" style={{ color: '#8F6B2F' }} />
              <AlertDescription style={{ color: '#5C4A1F' }}>
                <strong>Submission Under Review</strong>
                <p className="mt-1">
                  Your work submission is currently being reviewed by the bounty creator.
                  You'll be notified once they provide feedback.
                </p>
                <p className="text-xs mt-2">
                  Submitted on {format(new Date(existingSubmission.created_at), 'MMM dd, yyyy HH:mm')}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Existing Submission Status - Revision Requested */}
          {!loadingExisting && existingSubmission && existingSubmission.status === 'revision_requested' && (
            <Alert
              style={{
                backgroundColor: '#FFF4E6',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#FFD9A3',
              }}
            >
              <AlertCircle className="h-4 w-4" style={{ color: '#D97706' }} />
              <AlertDescription style={{ color: '#92400E' }}>
                <strong>Revision Requested</strong>
                <div className="mt-2 p-3 bg-white rounded border border-orange-200">
                  <h4 className="font-medium text-sm mb-1">Review Feedback:</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {existingSubmission.review_comments || 'No specific feedback provided.'}
                  </p>
                  {existingSubmission.reviewed_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Reviewed on {format(new Date(existingSubmission.reviewed_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-sm">
                  Please address the feedback above and resubmit your work using the form below.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Existing Submission Status - Approved */}
          {!loadingExisting && existingSubmission && existingSubmission.status === 'approved' && (
            <Alert
              style={{
                backgroundColor: '#D1E6DC',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#A8D5BA',
              }}
            >
              <AlertDescription style={{ color: '#1F453A' }}>
                <strong>Work Approved!</strong>
                <p className="mt-1">
                  Your work submission has been approved. Payment is being processed.
                </p>
                {existingSubmission.review_comments && (
                  <div className="mt-2 p-3 bg-white rounded border border-green-200">
                    <h4 className="font-medium text-sm mb-1">Feedback:</h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {existingSubmission.review_comments}
                    </p>
                  </div>
                )}
                <p className="text-xs mt-2">
                  Approved on {format(new Date(existingSubmission.reviewed_at || existingSubmission.created_at), 'MMM dd, yyyy HH:mm')}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Existing Submission Status - Rejected */}
          {!loadingExisting && existingSubmission && existingSubmission.status === 'rejected' && (
            <Alert
              style={{
                backgroundColor: '#F5E6E6',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#D9B3B3',
              }}
            >
              <AlertDescription style={{ color: '#5C1F1F' }}>
                <strong>Submission Rejected</strong>
                <div className="mt-2 p-3 bg-white rounded border border-red-200">
                  <h4 className="font-medium text-sm mb-1">Reason:</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {existingSubmission.review_comments || 'No reason provided.'}
                  </p>
                  {existingSubmission.reviewed_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Rejected on {format(new Date(existingSubmission.reviewed_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Submission Title */}
          <div className="space-y-2">
            <Label htmlFor="submissionTitle">Submission Title *</Label>
            <Input
              id="submissionTitle"
              value={formData.submissionTitle}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  submissionTitle: e.target.value,
                }))
              }
              placeholder="Brief title for your submission"
              required
            />
          </div>

          {/* Submission Description */}
          <div className="space-y-2">
            <Label htmlFor="submissionDescription">
              Submission Description *
            </Label>
            <Textarea
              id="submissionDescription"
              value={formData.submissionDescription}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  submissionDescription: e.target.value,
                }))
              }
              placeholder="Describe your completed work, approach, and any relevant details..."
              rows={6}
              required
            />
          </div>

          {/* Deliverable URLs */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Deliverable Links *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDeliverableUrl}
                style={{ color: '#3F7A5A' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2F5D50';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#3F7A5A';
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Link
              </Button>
            </div>

            {formData.deliverableUrls.map((deliverable, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium text-sm">
                    Deliverable {index + 1}
                  </h4>
                  {formData.deliverableUrls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDeliverableUrl(index)}
                      style={{ color: '#8B3A3A' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#5C1F1F';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#8B3A3A';
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Label</Label>
                  <Input
                    value={deliverable.label}
                    onChange={(e) =>
                      updateDeliverableUrl(index, 'label', e.target.value)
                    }
                    placeholder="e.g., 'GitHub Repository', 'Live Demo', 'Documentation'"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={deliverable.url}
                      onChange={(e) =>
                        updateDeliverableUrl(index, 'url', e.target.value)
                      }
                      placeholder="https://..."
                      type="url"
                    />
                    {deliverable.url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(deliverable.url, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Attachments */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Additional Attachments (Optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAttachmentUrl}
                style={{ color: '#2F5D50' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1F453A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#2F5D50';
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Attachment
              </Button>
            </div>

            {formData.attachmentUrls.map((url, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => updateAttachmentUrl(index, e.target.value)}
                  placeholder="Additional file URL (images, documents, etc.)"
                  type="url"
                />
                {formData.attachmentUrls.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeAttachmentUrl(index)}
                    style={{ color: '#8B3A3A' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#5C1F1F';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8B3A3A';
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Original Bid Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-2">Your Original Bid</h3>
            <div className="text-sm space-y-1">
              <p>
                <strong>Proposed Amount:</strong> {bid.proposedAmount}{' '}
                {bounty.value.token}
              </p>
              <p>
                <strong>Timeline:</strong> {bid.timeline}
              </p>
              <p>
                <strong>Payment Option:</strong> {bid.paymentOption}
              </p>
            </div>
          </div>

          {/* Error Display */}
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

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
              style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Work'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
