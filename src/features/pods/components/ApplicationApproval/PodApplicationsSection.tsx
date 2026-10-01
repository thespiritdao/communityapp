'use client';

import { useEffect, useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/utils/supabaseClient';
import { ApplicationApprovalCard } from './ApplicationApprovalCard';
import {
  ClipboardList,
  UserPlus,
  Clock,
  CheckCircle,
  Users,
  Crown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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

interface PodApplicationsSectionProps {
  podId: string;
  podName: string;
  isLeader: boolean; // Is current user a leader of this pod?
  onApplicationSubmit?: () => void; // Callback when user submits application
}

/**
 * Adaptive applications section for pod detail page
 * Shows different UI based on user role:
 * - Leaders: Full applications management panel
 * - Non-members: Apply to join button + their pending application
 * - Members: Nothing (they're already in)
 */
export const PodApplicationsSection: React.FC<PodApplicationsSectionProps> = ({
  podId,
  podName,
  isLeader,
  onApplicationSubmit,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [userApplication, setUserApplication] = useState<Application | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'member' | 'leader'>(
    'member',
  );
  const [showApplyForm, setShowApplyForm] = useState(false);

  useEffect(() => {
    loadData();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`pod_applications_${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pod_membership_applications',
          filter: `pod_id=eq.${podId}`,
        },
        () => {
          loadData();
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [podId, address]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Check if user is already a member
      if (address) {
        const { data: memberCheck } = await supabase
          .from('pod_members')
          .select('id')
          .eq('pod_id', podId)
          .eq('wallet', address.toLowerCase())
          .eq('is_active', true)
          .single();

        setIsMember(!!memberCheck);
      }

      if (isLeader) {
        // Leaders see all applications
        const { data, error } = await supabase
          .from('pod_membership_applications')
          .select('*')
          .eq('pod_id', podId)
          .neq('status', 'invited') // leader invitations have their own card
          .order('submitted_at', { ascending: false });

        if (error) throw error;
        setApplications(data || []);
      } else if (address) {
        // Non-leaders only see their own application
        const { data, error } = await supabase
          .from('pod_membership_applications')
          .select('*')
          .eq('pod_id', podId)
          .eq('applicant_address', address.toLowerCase())
          .neq('status', 'invited')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        setUserApplication(data);
      }
    } catch (error) {
      console.error('Failed to load applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyClick = () => {
    // Navigate to agreement signing flow
    // This should integrate with your existing application flow
    setShowApplyForm(true);
  };

  const pendingApps = applications.filter((app) => app.status === 'pending');
  const approvedApps = applications.filter((app) => app.status === 'approved');

  // If user is already a member, don't show anything
  if (isMember && !isLeader) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ========================================
  // LEADER VIEW: Full Applications Panel
  // ========================================
  if (isLeader) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Membership Applications
          </h3>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              style={{
                backgroundColor: '#FAF4EC',
                color: '#A67E35',
                borderColor: '#E8D7B8',
              }}
            >
              {pendingApps.length} Pending
            </Badge>
            <Badge
              variant="outline"
              style={{
                backgroundColor: '#D1E6DC',
                color: '#2F5D50',
                borderColor: '#B8D9CA',
              }}
            >
              {approvedApps.length} Approved
            </Badge>
          </div>
        </div>

        {pendingApps.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="font-medium">No pending applications</p>
              <p className="text-sm mt-1">
                Applications will appear here when users apply to join
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingApps.map((application) => (
              <ApplicationApprovalCard
                key={application.id}
                applicationId={application.id}
                onApproved={loadData}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ========================================
  // NON-LEADER VIEW: Apply Button + Status
  // ========================================

  // User has pending application - show status
  if (userApplication?.status === 'pending') {
    const roleIcon = userApplication.intended_role === 'leader' ? Crown : Users;
    const roleColor =
      userApplication.intended_role === 'leader' ? '#6A5F7A' : '#2F5D50';
    const roleBgColor =
      userApplication.intended_role === 'leader' ? '#EDEAF0' : '#E8F1EE';
    const RoleIcon = roleIcon;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: '#C6933F' }} />
              Your Application Status
            </CardTitle>
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: roleBgColor }}
            >
              <RoleIcon className="w-4 h-4" style={{ color: roleColor }} />
              <span
                className="text-sm font-medium"
                style={{ color: roleColor }}
              >
                {userApplication.intended_role === 'leader'
                  ? 'Leader'
                  : 'Member'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-l-4 pl-4 py-2"
            style={{ borderColor: '#C6933F' }}
          >
            <p className="text-sm font-medium text-gray-900 mb-1">
              Accountability Statement
            </p>
            <p className="text-sm text-gray-700">
              {userApplication.accountability_statement}
            </p>
          </div>

          <div
            className="flex items-center justify-between p-4 rounded-lg border"
            style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}
          >
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6" style={{ color: '#C6933F' }} />
              <div>
                <p className="font-medium text-gray-900">Pending Approval</p>
                <p className="text-sm text-gray-600">
                  {userApplication.current_votes} /{' '}
                  {userApplication.required_votes} leader votes received
                </p>
              </div>
            </div>
            <div className="flex-1 max-w-xs ml-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${(userApplication.current_votes / userApplication.required_votes) * 100}%`,
                    backgroundColor: '#C6933F',
                  }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Submitted{' '}
            {new Date(userApplication.submitted_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    );
  }

  // User application was approved - show success message
  if (userApplication?.status === 'approved') {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: '#3F7A5A' }}
          />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome to {podName}!
          </h3>
          <p className="text-gray-600">
            Your application was approved and your{' '}
            {userApplication.intended_role} HAT has been minted.
          </p>
        </CardContent>
      </Card>
    );
  }

  // User hasn't applied yet - show apply button
  if (!address) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Join {podName}
          </h3>
          <p className="text-gray-600 mb-4">
            Connect your wallet to apply for membership
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show apply form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Apply to Join {podName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Choose the role you're applying for and submit your application. Pod
            leaders will review and vote on your request.
          </p>

          {/* Role Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedRole('member')}
                className="p-4 rounded-lg border-2 transition-all"
                style={
                  selectedRole === 'member'
                    ? { borderColor: '#2F5D50', backgroundColor: '#E8F1EE' }
                    : { borderColor: '#e5e7eb' }
                }
                onMouseEnter={(e) => {
                  if (selectedRole !== 'member') {
                    e.currentTarget.style.borderColor = '#8FAAA1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedRole !== 'member') {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }
                }}
              >
                <Users
                  className="w-6 h-6 mx-auto mb-2"
                  style={{
                    color: selectedRole === 'member' ? '#2F5D50' : '#9ca3af',
                  }}
                />
                <div className="text-center">
                  <div
                    className="font-medium"
                    style={{
                      color: selectedRole === 'member' ? '#1F453A' : '#374151',
                    }}
                  >
                    Member
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Participate in pod activities
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedRole('leader')}
                className="p-4 rounded-lg border-2 transition-all"
                style={
                  selectedRole === 'leader'
                    ? { borderColor: '#6A5F7A', backgroundColor: '#EDEAF0' }
                    : { borderColor: '#e5e7eb' }
                }
                onMouseEnter={(e) => {
                  if (selectedRole !== 'leader') {
                    e.currentTarget.style.borderColor = '#9A8FA8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedRole !== 'leader') {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }
                }}
              >
                <Crown
                  className="w-6 h-6 mx-auto mb-2"
                  style={{
                    color: selectedRole === 'leader' ? '#6A5F7A' : '#9ca3af',
                  }}
                />
                <div className="text-center">
                  <div
                    className="font-medium"
                    style={{
                      color: selectedRole === 'leader' ? '#4A3F5A' : '#374151',
                    }}
                  >
                    Leader
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Help manage the pod
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Apply Button */}
          <Button onClick={handleApplyClick} className="w-full" size="lg">
            Continue to Application
          </Button>

          <p className="text-xs text-gray-500 text-center mt-4">
            You'll need to sign the pod agreement and write an accountability
            statement
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
