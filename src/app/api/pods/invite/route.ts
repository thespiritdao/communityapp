import type { NextRequest } from 'next/server';
import { PodGovernanceService } from '@/features/pods/services/podGovernanceService';
import { withPodManagement, PodAuthResponse, type PodAuthContext } from '@/features/pods/middleware/podAuthMiddleware';

export async function POST(request: NextRequest) {
  return withPodManagement(request, async (req, context: PodAuthContext) => {
    try {
      const body = await request.json();
      const { recipients, podName } = body;

      // Validate input
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return PodAuthResponse.error('Recipients array is required and cannot be empty');
      }

      console.log(`📨 Sending pod invites for ${context.podId} by ${context.userWallet}`);

      // Send invites using the existing service
      await PodGovernanceService.notifyPodInvites(
        context.podId,
        podName || 'Pod',
        recipients,
        context.userWallet
      );

      console.log(`✅ Pod invites sent for ${context.podId} to ${recipients.length} recipients`);

      return PodAuthResponse.success({
        message: 'Invites sent successfully',
        podId: context.podId,
        recipientCount: recipients.length,
        sentBy: context.userWallet
      });

    } catch (error) {
      console.error(`Failed to send pod invites for ${context.podId}:`, error);
      return PodAuthResponse.error(
        error instanceof Error ? error.message : 'Failed to send invites'
      );
    }
  });
}


