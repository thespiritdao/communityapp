// src/services/votingReminderService.ts

import { supabase } from '@/utils/supabaseClient';
import { unifiedNotificationService } from './unifiedNotificationService';

export interface TokenHolder {
  address: string;
  balance: string;
  tokenType: 'SYSTEM' | 'SELF' | 'POC' | 'EXECUTIVE_POD';
}

export interface ActiveProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status:
    | 'active'
    | 'pending'
    | 'succeeded'
    | 'defeated'
    | 'executed'
    | 'canceled';
  startBlock: string;
  endBlock: string;
  created_at: string;
  transaction_hash?: string;
}

export interface VotingReminder {
  id: string;
  proposal_id: string;
  user_address: string;
  reminder_type: '48h' | '24h' | '6h' | '1h';
  sent_at: string;
  created_at: string;
}

class VotingReminderService {
  private readonly REMINDER_INTERVALS = {
    '48h': 48 * 60 * 60 * 1000, // 48 hours in milliseconds
    '24h': 24 * 60 * 60 * 1000, // 24 hours
    '6h': 6 * 60 * 60 * 1000, // 6 hours
    '1h': 1 * 60 * 60 * 1000, // 1 hour
  };

  /**
   * Get all active proposals that need voting reminders
   */
  async getActiveProposals(): Promise<ActiveProposal[]> {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active proposals:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get active proposals:', error);
      return [];
    }
  }

  /**
   * Get token holders who are eligible to vote
   */
  async getEligibleVoters(): Promise<TokenHolder[]> {
    try {
      // This would integrate with your token balance checking logic
      // For now, we'll get users from profiles who have any tokens
      const { data, error } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .not('wallet_address', 'is', null);

      if (error) {
        console.error('Error fetching eligible voters:', error);
        return [];
      }

      // Transform to TokenHolder format
      // In a real implementation, you'd check actual token balances
      return (data || []).map((user) => ({
        address: user.wallet_address,
        balance: '1', // Placeholder - would be actual balance
        tokenType: 'SYSTEM' as const, // Placeholder - would be determined by balance check
      }));
    } catch (error) {
      console.error('Failed to get eligible voters:', error);
      return [];
    }
  }

  /**
   * Check if user has already voted on a proposal
   */
  async hasUserVoted(
    proposalId: string,
    userAddress: string,
  ): Promise<boolean> {
    try {
      // Check if user has voted (this would need to be implemented based on your voting system)
      // For now, we'll check the governance_notifications table for vote notifications
      const { data, error } = await supabase
        .from('governance_notifications')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('recipient_address', userAddress.toLowerCase())
        .eq('notification_type', 'proposal_voted')
        .limit(1);

      if (error) {
        console.error('Error checking if user has voted:', error);
        return false;
      }

      return (data || []).length > 0;
    } catch (error) {
      console.error('Failed to check if user has voted:', error);
      return false;
    }
  }

  /**
   * Check if reminder has already been sent
   */
  async hasReminderBeenSent(
    proposalId: string,
    userAddress: string,
    reminderType: '48h' | '24h' | '6h' | '1h',
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('voting_reminders')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('user_address', userAddress.toLowerCase())
        .eq('reminder_type', reminderType)
        .limit(1);

      if (error) {
        console.error('Error checking reminder status:', error);
        return false;
      }

      return (data || []).length > 0;
    } catch (error) {
      console.error('Failed to check reminder status:', error);
      return false;
    }
  }

  /**
   * Calculate time remaining until proposal deadline
   */
  calculateTimeRemaining(
    endBlock: string,
    currentBlock?: string,
  ): {
    hours: number;
    isExpiringSoon: boolean;
  } {
    // This is a simplified calculation
    // In reality, you'd need to get the current block number and calculate based on block time

    // For now, we'll use a mock calculation
    // Assuming average block time of 2 seconds on Base
    const AVERAGE_BLOCK_TIME = 2000; // 2 seconds in milliseconds
    const endBlockNum = Number.parseInt(endBlock);
    const currentBlockNum = currentBlock
      ? Number.parseInt(currentBlock)
      : endBlockNum - 100; // Mock current block

    const blocksRemaining = endBlockNum - currentBlockNum;
    const millisecondsRemaining = blocksRemaining * AVERAGE_BLOCK_TIME;
    const hoursRemaining = millisecondsRemaining / (1000 * 60 * 60);

    return {
      hours: Math.max(0, hoursRemaining),
      isExpiringSoon: hoursRemaining <= 48 && hoursRemaining > 0,
    };
  }

  /**
   * Send voting reminders for a specific proposal
   */
  async sendVotingReminders(proposalId: string): Promise<void> {
    console.log(`🗳️ Processing voting reminders for proposal: ${proposalId}`);

    try {
      // Get the proposal details
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (proposalError || !proposal) {
        console.error('Proposal not found:', proposalError);
        return;
      }

      // Calculate time remaining
      const { hours: hoursRemaining, isExpiringSoon } =
        this.calculateTimeRemaining(proposal.endBlock);

      if (!isExpiringSoon) {
        console.log(
          `⏳ Proposal ${proposalId} not expiring soon (${hoursRemaining.toFixed(1)}h remaining)`,
        );
        return;
      }

      // Determine which reminder to send
      let reminderType: '48h' | '24h' | '6h' | '1h';
      if (hoursRemaining > 24) {
        reminderType = '48h';
      } else if (hoursRemaining > 6) {
        reminderType = '24h';
      } else if (hoursRemaining > 1) {
        reminderType = '6h';
      } else {
        reminderType = '1h';
      }

      // Get eligible voters
      const eligibleVoters = await this.getEligibleVoters();
      console.log(`👥 Found ${eligibleVoters.length} eligible voters`);

      let remindersSent = 0;

      // Process each eligible voter
      for (const voter of eligibleVoters) {
        try {
          // Skip if user has already voted
          const hasVoted = await this.hasUserVoted(proposalId, voter.address);
          if (hasVoted) {
            continue;
          }

          // Skip if reminder already sent
          const reminderSent = await this.hasReminderBeenSent(
            proposalId,
            voter.address,
            reminderType,
          );
          if (reminderSent) {
            continue;
          }

          // Create voting reminder notification
          await unifiedNotificationService.createNotification({
            recipient_address: voter.address,
            sender_address: 'system',
            notification_type:
              `governance_voting_reminder_${reminderType}` as any,
            title: `Voting reminder: ${proposal.title}`,
            message: `⏰ ${Math.ceil(hoursRemaining)} hours remaining to vote on this proposal. Your ${voter.tokenType} token gives you voting power!`,
            context_type: 'governance',
            context_id: proposalId,
            context_url: `/governance/${proposalId}`,
            proposal_id: proposalId,
            priority: hoursRemaining <= 6 ? 'urgent' : 'high',
            metadata: {
              reminderType,
              hoursRemaining: Math.ceil(hoursRemaining),
              tokenType: voter.tokenType,
              proposalEndBlock: proposal.endBlock,
            },
          });

          // Record that reminder was sent
          await this.recordReminderSent(
            proposalId,
            voter.address,
            reminderType,
          );
          remindersSent++;
        } catch (error) {
          console.error(`Failed to send reminder to ${voter.address}:`, error);
        }
      }

      console.log(
        `✅ Sent ${remindersSent} voting reminders for proposal ${proposalId}`,
      );
    } catch (error) {
      console.error(
        `Failed to process voting reminders for proposal ${proposalId}:`,
        error,
      );
    }
  }

  /**
   * Process all active proposals for voting reminders
   */
  async processAllVotingReminders(): Promise<void> {
    console.log('🚀 Starting voting reminder processing...');

    try {
      const activeProposals = await this.getActiveProposals();
      console.log(`📊 Found ${activeProposals.length} active proposals`);

      for (const proposal of activeProposals) {
        await this.sendVotingReminders(proposal.id);

        // Add small delay to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log('✅ Completed voting reminder processing');
    } catch (error) {
      console.error('Failed to process voting reminders:', error);
    }
  }

  /**
   * Record that a reminder was sent
   */
  private async recordReminderSent(
    proposalId: string,
    userAddress: string,
    reminderType: '48h' | '24h' | '6h' | '1h',
  ): Promise<void> {
    try {
      const { error } = await supabase.from('voting_reminders').insert([
        {
          proposal_id: proposalId,
          user_address: userAddress.toLowerCase(),
          reminder_type: reminderType,
          sent_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error('Error recording reminder sent:', error);
      }
    } catch (error) {
      console.error('Failed to record reminder sent:', error);
    }
  }

  /**
   * Create token holder notifications for new proposals
   */
  async notifyTokenHoldersOfNewProposal(
    proposalId: string,
    proposalTitle: string,
    proposerAddress: string,
  ): Promise<void> {
    console.log(`📢 Notifying token holders of new proposal: ${proposalTitle}`);

    try {
      const eligibleVoters = await this.getEligibleVoters();

      const promises = eligibleVoters.map((voter) =>
        unifiedNotificationService.createNotification({
          recipient_address: voter.address,
          sender_address: proposerAddress,
          notification_type: 'token_holder_notification',
          title: `New proposal: ${proposalTitle}`,
          message: `A new governance proposal has been created. As a ${voter.tokenType} token holder, you can participate in voting!`,
          context_type: 'governance',
          context_id: proposalId,
          context_url: `/governance/${proposalId}`,
          proposal_id: proposalId,
          priority: 'medium',
          metadata: {
            tokenType: voter.tokenType,
            proposalType: 'new_proposal',
          },
        }),
      );

      await Promise.all(promises);
      console.log(
        `✅ Notified ${promises.length} token holders of new proposal`,
      );
    } catch (error) {
      console.error('Failed to notify token holders of new proposal:', error);
    }
  }

  /**
   * Get voting reminder statistics
   */
  async getReminderStats(proposalId?: string): Promise<{
    totalSent: number;
    byType: Record<'48h' | '24h' | '6h' | '1h', number>;
    byProposal?: Record<string, number>;
  }> {
    try {
      let query = supabase
        .from('voting_reminders')
        .select('proposal_id, reminder_type');

      if (proposalId) {
        query = query.eq('proposal_id', proposalId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting reminder stats:', error);
        return {
          totalSent: 0,
          byType: { '48h': 0, '24h': 0, '6h': 0, '1h': 0 },
        };
      }

      const stats = {
        totalSent: data?.length || 0,
        byType: { '48h': 0, '24h': 0, '6h': 0, '1h': 0 },
        byProposal: {} as Record<string, number>,
      };

      data?.forEach((reminder) => {
        stats.byType[reminder.reminder_type]++;

        if (!proposalId) {
          stats.byProposal![reminder.proposal_id] =
            (stats.byProposal![reminder.proposal_id] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Failed to get reminder stats:', error);
      return { totalSent: 0, byType: { '48h': 0, '24h': 0, '6h': 0, '1h': 0 } };
    }
  }
}

// Export singleton instance
export const votingReminderService = new VotingReminderService();
