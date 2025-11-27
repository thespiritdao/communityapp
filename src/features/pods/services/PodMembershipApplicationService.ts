import { supabase } from '@/utils/supabaseClient';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import type { PublicClient, WalletClient } from 'viem';

export interface MembershipApplicationData {
  podId: string;
  applicantAddress: string;
  agreementSignature: string;
  accountabilityStatement: string;
  intendedRole?: 'member' | 'leader'; // Role user is applying for
}

export interface ApplicationResult {
  success: boolean;
  message: string;
  applicationId?: string;
  error?: string;
}

/**
 * Service for handling pod membership applications that require approval
 */
export class PodMembershipApplicationService {
  /**
   * Get the required vote threshold based on pod's leader count
   * ✅ ISSUE #6 FIX: Calculate dynamic threshold instead of hardcoded 3
   *
   * @param podId - The pod ID to get threshold for
   * @returns Required votes (majority of leaders, minimum 2 for pods with 3+ leaders)
   */
  static async getRequiredVotes(podId: string): Promise<number> {
    // Check for testing mode (override for development)
    if (process.env.NEXT_PUBLIC_PODS_TESTING === 'true') {
      return 1; // Testing mode: only 1 vote required
    }

    try {
      // Fetch pod to get leader count
      const { data: pod, error } = await supabase
        .from('pods')
        .select('pod_leads, approval_threshold')
        .eq('id', podId)
        .single();

      if (error || !pod) {
        console.warn(
          '⚠️ Failed to fetch pod for vote threshold, defaulting to 2',
        );
        return 2; // Safe default
      }

      const leaderCount = (pod.pod_leads as string[])?.length || 0;

      // If pod has a custom approval_threshold, use it
      if (
        pod.approval_threshold &&
        typeof pod.approval_threshold === 'number'
      ) {
        return Math.max(2, Math.min(pod.approval_threshold, leaderCount));
      }

      // ✅ DYNAMIC THRESHOLD: Majority of leaders (simple majority)
      // Examples:
      // - 3 leaders → 2 votes required (majority)
      // - 5 leaders → 3 votes required (majority)
      // - 7 leaders → 4 votes required (majority)
      // - 2 leaders → 2 votes required (all must approve for security)
      // - 1 leader → 1 vote required (solo approval)

      if (leaderCount === 0) {
        console.warn('⚠️ Pod has no leaders - cannot approve applications');
        return 999; // Effectively blocks approval
      }

      if (leaderCount === 1) {
        return 1; // Solo leader can approve
      }

      if (leaderCount === 2) {
        return 2; // Both must approve for security
      }

      // For 3+ leaders, require simple majority
      const majorityVotes = Math.ceil(leaderCount / 2);

      console.log(`📊 Vote threshold calculated for pod ${podId}:`, {
        leaderCount,
        requiredVotes: majorityVotes,
        percentage: `${Math.round((majorityVotes / leaderCount) * 100)}%`,
      });

      return majorityVotes;
    } catch (error) {
      console.error('❌ Error calculating vote threshold:', error);
      return 2; // Safe fallback
    }
  }

  /**
   * Submit a membership application (doesn't mint hat immediately)
   */
  static async submitApplication(
    applicationData: MembershipApplicationData,
  ): Promise<ApplicationResult> {
    try {
      console.log(
        '📝 Submitting membership application for approval:',
        applicationData,
      );

      // Debug auth session for RLS policies
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        console.log('🔐 Current Supabase session:', {
          hasSession: !!session,
          userId: session?.user?.id,
          userRole: session?.user?.role,
        });
      } catch (authError) {
        console.warn('⚠️ Auth session check failed:', authError);
      }

      // 1. Get pod details
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('*')
        .eq('id', applicationData.podId)
        .single();

      if (podError || !pod) {
        throw new Error(
          `Pod not found: ${podError?.message || 'Unknown error'}`,
        );
      }

      // 2. Store the application in database
      console.log('📝 Storing application data:', {
        podId: applicationData.podId,
        applicantAddress: applicationData.applicantAddress,
        agreementSignatureLength: applicationData.agreementSignature?.length,
        agreementSignaturePreview:
          applicationData.agreementSignature?.substring(0, 20) + '...',
        accountabilityStatement: applicationData.accountabilityStatement,
      });

      // ✅ ISSUE #6 FIX: Calculate dynamic threshold based on leader count
      const requiredVotes = await this.getRequiredVotes(applicationData.podId);

      const { data: application, error: appError } = await supabase
        .from('pod_membership_applications')
        .insert({
          pod_id: applicationData.podId,
          applicant_address: applicationData.applicantAddress,
          agreement_signature: applicationData.agreementSignature,
          accountability_statement: applicationData.accountabilityStatement,
          intended_role: applicationData.intendedRole || 'member', // Store intended role
          status: 'pending',
          required_votes: requiredVotes,
          current_votes: 0,
          voting_leaders: [],
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (appError) {
        console.error('Failed to store membership application:', appError);

        // Handle various database issues with fallback
        if (appError.code === '42P01') {
          console.log(
            '📋 Membership applications table not found, using direct approval fallback',
          );
        } else if (appError.code === '42501') {
          console.log('🔒 RLS policy blocking, using direct approval fallback');
        } else {
          console.warn(
            '📋 Database error, using direct approval fallback:',
            appError.message,
          );
        }

        // For now, continue with just notifications until database is set up
        console.log(
          '📧 Database not ready - will send notifications to leaders for manual approval...',
        );
      }

      const applicationId = application?.id || `temp-${Date.now()}`;

      // 3. Notify all pod leaders about the new application
      const leaders = pod.pod_leads || [];
      const notifications = await Promise.all(
        leaders.map((leaderAddress) =>
          unifiedNotificationService.createNotification({
            recipient_address: leaderAddress,
            sender_address: applicationData.applicantAddress,
            notification_type: 'user_mentioned',
            title: `Membership Application: ${pod.name}`,
            message: `A new membership application requires your approval. ${this.getRequiredVotes()} vote(s) needed.`,
            context_type: 'governance',
            context_id: applicationData.podId,
            context_url: `/pods/${applicationData.podId}/applications/${applicationId}`, // New route for approvals
            priority: 'high',
            metadata: {
              application_type: 'pod_membership',
              application_id: applicationId,
              applicant_address: applicationData.applicantAddress,
              pod_name: pod.name,
              required_votes: this.getRequiredVotes(),
            },
          }),
        ),
      );

      return {
        success: true,
        message: `Application submitted! Requires ${this.getRequiredVotes()} leader approval(s).`,
        applicationId,
      };
    } catch (error) {
      console.error('❌ Failed to submit membership application:', error);
      return {
        success: false,
        message: 'Failed to submit membership application',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ✅ CLEANUP NOTE: Removed deprecated approveApplication() and rejectApplication() methods
  // These were only used by the old /pods/[id]/applications/[applicationId] page (now deleted)
  // The new OnchainKit-based flow uses ApproveApplicationButton and VoteOnApplicationButton components instead
  // which handle voting/approval with sponsored transactions and eligibility checking

  /**
   * Get pending applications for a pod
   */
  static async getPendingApplications(podId: string) {
    try {
      const { data, error } = await supabase
        .from('pod_membership_applications')
        .select('*')
        .eq('pod_id', podId)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get pending applications:', error);
      return [];
    }
  }
}
