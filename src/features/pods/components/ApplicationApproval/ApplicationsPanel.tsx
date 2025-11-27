'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { supabase } from '@/utils/supabaseClient';
import { ApplicationApprovalCard } from './ApplicationApprovalCard';
import { ClipboardList, CheckCircle, XCircle } from 'lucide-react';

interface Application {
  id: string;
  applicant_address: string;
  pod_id: string;
  intended_role: 'member' | 'leader';
  accountability_statement: string;
  status: string;
  current_votes: number;
  required_votes: number;
  voting_leaders: string[];
  submitted_at: string;
}

interface ApplicationsPanelProps {
  podId: string;
  canManageMembers: boolean;
}

/**
 * Panel that displays pending membership applications for pod leaders to review
 */
export const ApplicationsPanel: React.FC<ApplicationsPanelProps> = ({
  podId,
  canManageMembers
}) => {
  const { address } = useAccount();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  useEffect(() => {
    loadApplications();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`pod_applications_${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pod_membership_applications',
          filter: `pod_id=eq.${podId}`
        },
        () => {
          loadApplications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [podId]); // Removed filter from deps - we filter in UI now

  const loadApplications = async () => {
    try {
      setLoading(true);

      // ALWAYS load ALL applications - don't filter in query
      const { data, error } = await supabase
        .from('pod_membership_applications')
        .select('*')
        .eq('pod_id', podId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      setApplications(data || []);
    } catch (error) {
      console.error('Failed to load applications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate counts from ALL applications (not filtered)
  const pendingApps = applications.filter(app => app.status === 'pending');
  const approvedApps = applications.filter(app => app.status === 'approved');
  const rejectedApps = applications.filter(app => app.status === 'rejected');

  // Apply UI filter for display
  const displayedApplications = filter === 'all'
    ? applications
    : filter === 'pending'
    ? pendingApps
    : filter === 'approved'
    ? approvedApps
    : rejectedApps;

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Show access denied if not a manager
  if (!canManageMembers) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <XCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Access Restricted
          </h3>
          <p className="text-gray-600">
            Only pod leaders can view and approve membership applications.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Membership Applications</h2>
        <p className="text-gray-600 mt-1">
          Review and approve applications from new members
        </p>
      </div>

      {/* Filter Tabs - Now on separate row */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('pending')}
          className="px-4 py-2 rounded-lg font-medium transition-colors"
          style={filter === 'pending'
            ? { backgroundColor: '#C6933F', color: '#FFFFFF' }
            : { backgroundColor: '#f3f4f6', color: '#4b5563' }
          }
          onMouseEnter={(e) => filter !== 'pending' && (e.currentTarget.style.backgroundColor = '#e5e7eb')}
          onMouseLeave={(e) => filter !== 'pending' && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
        >
          Pending ({pendingApps.length})
        </button>
        <button
          onClick={() => setFilter('approved')}
          className="px-4 py-2 rounded-lg font-medium transition-colors"
          style={filter === 'approved'
            ? { backgroundColor: '#3F7A5A', color: '#FFFFFF' }
            : { backgroundColor: '#f3f4f6', color: '#4b5563' }
          }
          onMouseEnter={(e) => filter !== 'approved' && (e.currentTarget.style.backgroundColor = '#e5e7eb')}
          onMouseLeave={(e) => filter !== 'approved' && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
        >
          Approved ({approvedApps.length})
        </button>
        <button
          onClick={() => setFilter('all')}
          className="px-4 py-2 rounded-lg font-medium transition-colors"
          style={filter === 'all'
            ? { backgroundColor: '#4b5563', color: '#FFFFFF' }
            : { backgroundColor: '#f3f4f6', color: '#4b5563' }
          }
          onMouseEnter={(e) => filter !== 'all' && (e.currentTarget.style.backgroundColor = '#e5e7eb')}
          onMouseLeave={(e) => filter !== 'all' && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
        >
          All ({applications.length})
        </button>
      </div>

      {/* Applications List */}
      {displayedApplications.length === 0 ? (
        <Card className="p-8 text-center">
          <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Applications
          </h3>
          <p className="text-gray-600">
            {filter === 'pending'
              ? 'No pending applications at the moment.'
              : filter === 'approved'
              ? 'No approved applications yet.'
              : 'No applications have been submitted yet.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayedApplications.map((application) => (
            <ApplicationApprovalCard
              key={application.id}
              applicationId={application.id}
              onApproved={loadApplications}
            />
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {applications.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-around text-center">
            <div>
              <div className="flex items-center justify-center gap-2 mb-1" style={{ color: '#C6933F' }}>
                <ClipboardList className="w-5 h-5" />
                <span className="text-2xl font-bold">{pendingApps.length}</span>
              </div>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
            <div className="h-12 w-px bg-gray-200" />
            <div>
              <div className="flex items-center justify-center gap-2 mb-1" style={{ color: '#3F7A5A' }}>
                <CheckCircle className="w-5 h-5" />
                <span className="text-2xl font-bold">{approvedApps.length}</span>
              </div>
              <p className="text-sm text-gray-600">Approved</p>
            </div>
            <div className="h-12 w-px bg-gray-200" />
            <div>
              <div className="flex items-center justify-center gap-2 mb-1" style={{ color: '#8B3A3A' }}>
                <XCircle className="w-5 h-5" />
                <span className="text-2xl font-bold">{rejectedApps.length}</span>
              </div>
              <p className="text-sm text-gray-600">Rejected</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
