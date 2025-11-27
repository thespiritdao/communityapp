// src/features/forum/components/ReportQueue.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useModerationPermissions } from '../hooks/useModerationPermissions';
import {
  getPendingReports,
  reviewReport,
  type PostReport
} from '../services/ModerationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ReportQueue() {
  const { address } = useAccount();
  const { canReviewReports } = useModerationPermissions();
  const [reports, setReports] = useState<PostReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingReportId, setProcessingReportId] = useState<string | null>(null);

  useEffect(() => {
    if (canReviewReports) {
      loadReports();
    }
  }, [canReviewReports]);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const result = await getPendingReports();
      if (result.success && result.reports) {
        setReports(result.reports);
      } else {
        console.error('Failed to load reports:', result.error);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReview = async (
    reportId: string,
    status: 'reviewed' | 'dismissed' | 'actioned'
  ) => {
    if (!address) return;

    setProcessingReportId(reportId);
    try {
      const result = await reviewReport(reportId, address, status);
      if (result.success) {
        setReports(prev => prev.filter(r => r.id !== reportId));
      } else {
        alert(`Failed to review report: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reviewing report:', error);
      alert('Failed to review report');
    } finally {
      setProcessingReportId(null);
    }
  };

  if (!canReviewReports) {
    return null;
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading reports...</div>;
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Report Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No pending reports</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Queue ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.map(report => (
          <div
            key={report.id}
            className="border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {report.report_type}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {report.thread_id ? 'Thread' : 'Post'} ID: {report.thread_id || report.post_id}
                  </span>
                </div>
                <p className="text-sm">
                  Reported by: <code className="text-xs">{report.reporter_address.slice(0, 10)}...</code>
                </p>
                {report.description && (
                  <p className="text-sm text-gray-700 mt-2">
                    {report.description}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  {new Date(report.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReview(report.id, 'dismissed')}
                disabled={processingReportId === report.id}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReview(report.id, 'reviewed')}
                disabled={processingReportId === report.id}
              >
                Mark Reviewed
              </Button>
              <Button
                size="sm"
                onClick={() => handleReview(report.id, 'actioned')}
                disabled={processingReportId === report.id}
              >
                Action Taken
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
