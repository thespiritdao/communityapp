'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Scale,
  FileText,
  Upload,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Send,
} from 'lucide-react';

interface DisputeManagementDashboardProps {
  disputeId: string;
  onClose?: () => void;
}

export const DisputeManagementDashboard: React.FC<
  DisputeManagementDashboardProps
> = ({ disputeId, onClose }) => {
  const { address } = useAccount();

  // State
  const [dispute, setDispute] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Evidence submission state
  const [evidenceType, setEvidenceType] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceLinks, setEvidenceLinks] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  // Comment state
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Resolution state
  const [resolutionType, setResolutionType] = useState('');
  const [resolutionDescription, setResolutionDescription] = useState('');
  const [submittingResolution, setSubmittingResolution] = useState(false);

  // Load dispute data
  useEffect(() => {
    if (disputeId) {
      loadDisputeData();
    }
  }, [disputeId]);

  const loadDisputeData = async () => {
    try {
      setLoading(true);

      // Load dispute, evidence, and resolutions in parallel
      const [disputeRes, evidenceRes, resolutionsRes] = await Promise.all([
        fetch(`/api/bounty/dispute?disputeId=${disputeId}`),
        fetch(`/api/bounty/dispute/evidence?disputeId=${disputeId}`),
        fetch(`/api/bounty/dispute/resolve?disputeId=${disputeId}`),
      ]);

      if (disputeRes.ok) {
        const disputeData = await disputeRes.json();
        setDispute(disputeData.dispute);
      }

      if (evidenceRes.ok) {
        const evidenceData = await evidenceRes.json();
        setEvidence(evidenceData.evidence || []);
      }

      if (resolutionsRes.ok) {
        const resolutionsData = await resolutionsRes.json();
        setResolutions(resolutionsData.resolutions || []);
      }
    } catch (err) {
      console.error('❌ Error loading dispute data:', err);
      setError('Failed to load dispute data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !address ||
      !evidenceType ||
      !evidenceTitle.trim() ||
      !evidenceDescription.trim()
    ) {
      setError('Please fill in all required evidence fields');
      return;
    }

    const links = evidenceLinks
      .trim()
      .split('\n')
      .filter((l) => l.trim().length > 0);
    if (links.length === 0) {
      setError('Please provide at least one link or file URL');
      return;
    }

    try {
      setSubmittingEvidence(true);
      setError('');

      const response = await fetch('/api/bounty/dispute/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId,
          submitterAddress: address,
          evidenceType,
          evidenceTitle: evidenceTitle.trim(),
          evidenceDescription: evidenceDescription.trim(),
          externalLinks: links,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit evidence');
      }

      console.log('✅ Evidence submitted:', data);

      // Reset form and reload evidence
      setEvidenceType('');
      setEvidenceTitle('');
      setEvidenceDescription('');
      setEvidenceLinks('');
      await loadDisputeData();
    } catch (err) {
      console.error('❌ Error submitting evidence:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to submit evidence',
      );
    } finally {
      setSubmittingEvidence(false);
    }
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address || !resolutionType || !resolutionDescription.trim()) {
      setError('Please fill in all required resolution fields');
      return;
    }

    try {
      setSubmittingResolution(true);
      setError('');

      const response = await fetch('/api/bounty/dispute/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId,
          proposerAddress: address,
          resolutionType,
          resolutionDescription: resolutionDescription.trim(),
          executeImmediately: false, // Users propose, pod leaders execute
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to propose resolution');
      }

      console.log('✅ Resolution proposed:', data);

      // Reset form and reload resolutions
      setResolutionType('');
      setResolutionDescription('');
      await loadDisputeData();
    } catch (err) {
      console.error('❌ Error proposing resolution:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to propose resolution',
      );
    } finally {
      setSubmittingResolution(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; label: string }> = {
      open: { color: 'bg-blue-100 text-blue-800', label: 'Open' },
      under_review: {
        color: 'bg-yellow-100 text-yellow-800',
        label: 'Under Review',
      },
      awaiting_evidence: {
        color: 'bg-orange-100 text-orange-800',
        label: 'Awaiting Evidence',
      },
      pending_resolution: {
        color: 'bg-purple-100 text-purple-800',
        label: 'Pending Resolution',
      },
      resolved_for_creator: {
        color: 'bg-green-100 text-green-800',
        label: 'Resolved - Creator',
      },
      resolved_for_bidder: {
        color: 'bg-green-100 text-green-800',
        label: 'Resolved - Bidder',
      },
      resolved_compromise: {
        color: 'bg-green-100 text-green-800',
        label: 'Resolved - Compromise',
      },
      withdrawn: { color: 'bg-gray-100 text-gray-800', label: 'Withdrawn' },
      closed: { color: 'bg-gray-100 text-gray-800', label: 'Closed' },
    };

    const statusInfo = statusMap[status] || {
      color: 'bg-gray-100 text-gray-800',
      label: status,
    };
    return <Badge className={statusInfo.color}>{statusInfo.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { color: string; label: string }> = {
      low: { color: 'bg-gray-100 text-gray-800', label: 'Low' },
      medium: { color: 'bg-blue-100 text-blue-800', label: 'Medium' },
      high: { color: 'bg-orange-100 text-orange-800', label: 'High' },
      urgent: { color: 'bg-red-100 text-red-800', label: 'Urgent' },
    };

    const priorityInfo = priorityMap[priority] || {
      color: 'bg-gray-100 text-gray-800',
      label: priority,
    };
    return <Badge className={priorityInfo.color}>{priorityInfo.label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading dispute details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!dispute) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-600">Dispute not found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const evidenceTypes = [
    { value: 'work_sample', label: 'Work Sample' },
    { value: 'communication_log', label: 'Communication Log' },
    { value: 'contract_document', label: 'Contract Document' },
    { value: 'payment_proof', label: 'Payment Proof' },
    { value: 'timeline_proof', label: 'Timeline Proof' },
    { value: 'requirement_proof', label: 'Requirement Proof' },
    { value: 'screenshot', label: 'Screenshot' },
    { value: 'video', label: 'Video' },
    { value: 'document', label: 'Document' },
    { value: 'link', label: 'External Link' },
    { value: 'other', label: 'Other' },
  ];

  const resolutionTypes = [
    { value: 'payment_released', label: 'Release Full Payment' },
    { value: 'payment_refunded', label: 'Refund to Creator' },
    { value: 'partial_payment', label: 'Partial Payment' },
    { value: 'work_revision_required', label: 'Require Work Revision' },
    { value: 'bounty_cancelled', label: 'Cancel Bounty' },
    { value: 'extend_deadline', label: 'Extend Deadline' },
    { value: 'reduce_scope', label: 'Reduce Scope' },
    { value: 'no_action', label: 'No Action' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-orange-600" />
                {dispute.dispute_title}
              </CardTitle>
              <CardDescription className="mt-2">
                Dispute #{disputeId.slice(0, 8)}... • Filed{' '}
                {new Date(dispute.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            {getStatusBadge(dispute.status)}
            {getPriorityBadge(dispute.priority)}
            <Badge className="bg-gray-100 text-gray-800">
              {dispute.dispute_type.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-2">Description</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {dispute.dispute_description}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">Desired Resolution</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {dispute.desired_resolution}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Filed By:</span>
                <p className="text-gray-700">
                  {dispute.filed_by.slice(0, 10)}... ({dispute.filer_role})
                </p>
              </div>
              <div>
                <span className="font-semibold">Filed Against:</span>
                <p className="text-gray-700">
                  {dispute.filed_against.slice(0, 10)}...
                </p>
              </div>
              <div>
                <span className="font-semibold">Disputed Amount:</span>
                <p className="text-gray-700">
                  {dispute.disputed_amount} {dispute.disputed_token}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="evidence" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="evidence">
            <FileText className="h-4 w-4 mr-2" />
            Evidence ({evidence.length})
          </TabsTrigger>
          <TabsTrigger value="resolutions">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Resolutions ({resolutions.length})
          </TabsTrigger>
          <TabsTrigger value="submit">
            <Send className="h-4 w-4 mr-2" />
            Submit
          </TabsTrigger>
        </TabsList>

        {/* Evidence Tab */}
        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evidence</CardTitle>
              <CardDescription>
                Evidence submitted by both parties
              </CardDescription>
            </CardHeader>
            <CardContent>
              {evidence.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No evidence submitted yet
                </div>
              ) : (
                <div className="space-y-4">
                  {evidence.map((item: any) => (
                    <Card key={item.id} className="border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {item.evidence_title}
                            </CardTitle>
                            <CardDescription>
                              Submitted by {item.submitter_role} •{' '}
                              {new Date(item.created_at).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800">
                            {item.evidence_type.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-700 mb-3">
                          {item.evidence_description}
                        </p>
                        {item.external_links &&
                          item.external_links.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-sm font-semibold">Links:</p>
                              {item.external_links.map(
                                (link: string, idx: number) => (
                                  <a
                                    key={idx}
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-sm text-blue-600 hover:underline truncate"
                                  >
                                    {link}
                                  </a>
                                ),
                              )}
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resolutions Tab */}
        <TabsContent value="resolutions">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Proposed Resolutions</CardTitle>
              <CardDescription>
                Resolution proposals from parties and mediators
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resolutions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No resolutions proposed yet
                </div>
              ) : (
                <div className="space-y-4">
                  {resolutions.map((resolution: any) => (
                    <Card key={resolution.id} className="border">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {resolution.resolution_type.replace(/_/g, ' ')}
                            </CardTitle>
                            <CardDescription>
                              Proposed by {resolution.proposer_role} •{' '}
                              {new Date(
                                resolution.created_at,
                              ).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          <Badge
                            className={
                              resolution.status === 'executed'
                                ? 'bg-green-100 text-green-800'
                                : resolution.status === 'approved'
                                  ? 'bg-blue-100 text-blue-800'
                                  : resolution.status === 'rejected'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {resolution.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-700">
                          {resolution.resolution_description}
                        </p>
                        {resolution.executed_at && (
                          <p className="text-xs text-green-600 mt-2">
                            ✅ Executed on{' '}
                            {new Date(resolution.executed_at).toLocaleString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submit Tab */}
        <TabsContent value="submit">
          <div className="space-y-4">
            {/* Submit Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Submit Evidence
                </CardTitle>
                <CardDescription>
                  Provide evidence to support your case
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitEvidence} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="evidenceType">Evidence Type *</Label>
                    <Select
                      value={evidenceType}
                      onValueChange={setEvidenceType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {evidenceTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="evidenceTitle">Title *</Label>
                    <input
                      id="evidenceTitle"
                      type="text"
                      value={evidenceTitle}
                      onChange={(e) => setEvidenceTitle(e.target.value)}
                      placeholder="Brief title for this evidence..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="evidenceDescription">Description *</Label>
                    <Textarea
                      id="evidenceDescription"
                      value={evidenceDescription}
                      onChange={(e) => setEvidenceDescription(e.target.value)}
                      placeholder="Explain what this evidence shows..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="evidenceLinks">
                      Links (one per line) *
                    </Label>
                    <Textarea
                      id="evidenceLinks"
                      value={evidenceLinks}
                      onChange={(e) => setEvidenceLinks(e.target.value)}
                      placeholder="https://example.com/evidence1&#10;https://example.com/evidence2"
                      rows={4}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submittingEvidence}
                    className="w-full"
                  >
                    {submittingEvidence ? 'Submitting...' : 'Submit Evidence'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Propose Resolution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Propose Resolution
                </CardTitle>
                <CardDescription>
                  Suggest how this dispute should be resolved
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitResolution} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resolutionType">Resolution Type *</Label>
                    <Select
                      value={resolutionType}
                      onValueChange={setResolutionType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {resolutionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resolutionDescription">
                      Resolution Details *
                    </Label>
                    <Textarea
                      id="resolutionDescription"
                      value={resolutionDescription}
                      onChange={(e) => setResolutionDescription(e.target.value)}
                      placeholder="Explain your proposed resolution in detail..."
                      rows={6}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submittingResolution}
                    className="w-full"
                  >
                    {submittingResolution
                      ? 'Submitting...'
                      : 'Propose Resolution'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 ml-2">
            {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
