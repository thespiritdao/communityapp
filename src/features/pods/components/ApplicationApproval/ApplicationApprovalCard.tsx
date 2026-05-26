'use client';

import { useEffect, useState } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { Card } from '@/components/ui/card';
import { supabase } from '@/utils/supabaseClient';
import { ApproveApplicationButton } from './ApproveApplicationButton';
import { VoteOnApplicationButton } from './VoteOnApplicationButton';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { Users, Crown } from 'lucide-react';

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

interface Pod {
  id: string;
  name: string;
  membership_hat_id: string;
  management_hat_id: string;
}

interface ApplicationApprovalCardProps {
  applicationId: string;
  onApproved?: () => void;
}

interface MemberRole {
  id: string;
  role_name: string;
  token_address: string;
  is_active: boolean;
}

export const ApplicationApprovalCard: React.FC<
  ApplicationApprovalCardProps
> = ({ applicationId, onApproved }) => {
  // Identity wallet (canonical) — the hasVoted check compares against
  // voting_leaders, which VoteOnApplicationButton now writes as canonical.
  const address = useUserWallet();
  const [application, setApplication] = useState<Application | null>(null);
  const [pod, setPod] = useState<Pod | null>(null);
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false);

  // Get applicant profile
  const { getProfile } = useProfiles(
    application ? [application.applicant_address] : [],
  );
  const applicantProfile = application
    ? getProfile(application.applicant_address)
    : null;

  useEffect(() => {
    loadApplication();
  }, [applicationId]);

  const loadApplication = async () => {
    try {
      setLoading(true);

      // Get application
      const { data: app, error: appError } = await supabase
        .from('pod_membership_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      setApplication(app);

      // Check if current user has voted
      if (address) {
        const voted =
          app.voting_leaders?.includes(address.toLowerCase()) || false;
        setHasVoted(voted);
      }

      // Get pod details
      const { data: podData, error: podError } = await supabase
        .from('pods')
        .select('id, name, membership_hat_id, management_hat_id')
        .eq('id', app.pod_id)
        .single();

      if (podError) throw podError;

      setPod(podData);

      // Fetch member roles (non-leader roles) from pod_role_permissions
      const { data: rolesData, error: rolesError } = await supabase
        .from('pod_role_permissions')
        .select('id, role_name, token_address, is_active')
        .eq('pod_id', app.pod_id)
        .eq('is_active', true)
        .neq('token_address', podData.management_hat_id); // Exclude leader role

      if (rolesError) {
        console.error('Failed to load member roles:', rolesError);
        setMemberRoles([]);
      } else {
        setMemberRoles(rolesData || []);
        console.log(`📋 Loaded ${rolesData?.length || 0} member roles for pod`, rolesData);
      }
    } catch (error) {
      console.error('Failed to load application:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  if (!application || !pod) {
    return (
      <Card className="p-6">
        <p className="text-gray-500">Application not found</p>
      </Card>
    );
  }

  const intendedRole = application.intended_role || 'member';

  // For member applications, use the first available member role from pod_role_permissions
  // For leader applications, use the management HAT ID
  let hatToMint: string;
  if (intendedRole === 'leader') {
    hatToMint = pod.management_hat_id;
  } else {
    // Use first available member role, or fall back to membership_hat_id if no roles found
    hatToMint = memberRoles[0]?.token_address || pod.membership_hat_id || '';
    console.log(`🎯 Selected member role for application:`, {
      roleName: memberRoles[0]?.role_name,
      tokenAddress: memberRoles[0]?.token_address,
      totalMemberRoles: memberRoles.length,
    });
  }

  const roleLabel = intendedRole === 'leader' ? 'Leader' : 'Member';
  const RoleIcon = intendedRole === 'leader' ? Crown : Users;
  const roleColor = intendedRole === 'leader' ? '#6A5F7A' : '#2F5D50';
  const roleBgColor = intendedRole === 'leader' ? '#EDEAF0' : '#E8F1EE';

  const isReadyToApprove =
    application.current_votes >= application.required_votes - 1;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{pod.name}</h3>
            <p className="text-sm text-gray-600">
              Application from{' '}
              {applicantProfile?.first_name || applicantProfile?.last_name
                ? `${applicantProfile.first_name || ''} ${applicantProfile.last_name || ''}`.trim()
                : 'No Name'}
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full"
            style={{ backgroundColor: roleBgColor }}
          >
            <RoleIcon className="w-4 h-4" style={{ color: roleColor }} />
            <span className="text-sm font-medium" style={{ color: roleColor }}>
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Accountability Statement */}
        <div className="border-l-4 border-gray-200 pl-4">
          <p className="text-sm text-gray-700">
            {application.accountability_statement}
          </p>
        </div>

        {/* Voting Progress */}
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="font-medium">Votes:</span>
            <span className="ml-2">
              {application.current_votes} / {application.required_votes}
            </span>
          </div>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(application.current_votes / application.required_votes) * 100}%`,
                backgroundColor: '#3F7A5A',
              }}
            />
          </div>
        </div>

        {/* Status Messages */}
        {hasVoted && (
          <div className="text-sm font-medium" style={{ color: '#3F7A5A' }}>
            ✓ You have already approved this application
          </div>
        )}

        {application.status === 'approved' && (
          <div className="text-sm font-medium" style={{ color: '#3F7A5A' }}>
            ✓ Application approved - Role has been minted
          </div>
        )}

        {/* Approval Button */}
        {!hasVoted && application.status === 'pending' && (
          <div className="pt-4 border-t">
            {isReadyToApprove ? (
              <div className="space-y-2">
                <div
                  className="text-sm font-medium"
                  style={{ color: '#3F7A5A' }}
                >
                  🎉 Final approval! This will mint the {roleLabel} role
                </div>
                <ApproveApplicationButton
                  applicationId={application.id}
                  applicantAddress={application.applicant_address}
                  applicantProfile={applicantProfile}
                  podId={pod.id}
                  podName={pod.name}
                  hatIdToMint={hatToMint}
                  managementHatId={pod.management_hat_id}
                  roleLabel={roleLabel}
                  onSuccess={() => {
                    onApproved?.();
                    loadApplication(); // Reload to show updated status
                  }}
                />
              </div>
            ) : (
              <VoteOnApplicationButton
                applicationId={application.id}
                currentVotes={application.current_votes}
                requiredVotes={application.required_votes}
                votingLeaders={application.voting_leaders || []}
                podId={application.pod_id}
                onSuccess={loadApplication}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
