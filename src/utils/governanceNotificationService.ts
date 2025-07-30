import { supabase } from './supabaseClient';

export interface GovernanceNotification {
  id: string;
  recipient_address: string;
  sender_address: string;
  notification_type: 'proposal_mentioned' | 'proposal_created' | 'proposal_voted' | 'proposal_executed' | 'proposal_cancelled' | 'token_holder_notification';
  title: string;
  message: string;
  context_url?: string;
  context_type?: 'governance';
  context_id?: string;
  proposal_id?: string;
  transaction_hash?: string;
  is_read: boolean;
  created_at: string;
}

export interface CreateGovernanceNotificationData {
  recipient_address: string;
  sender_address: string;
  notification_type: 'proposal_mentioned' | 'proposal_created' | 'proposal_voted' | 'proposal_executed' | 'proposal_cancelled' | 'token_holder_notification';
  title: string;
  message: string;
  context_url?: string;
  context_type?: 'governance';
  context_id?: string;
  proposal_id?: string;
  transaction_hash?: string;
}

export const governanceNotificationService = {
  // Create a governance notification via API route (bypasses RLS)
  async createNotification(notificationData: CreateGovernanceNotificationData): Promise<GovernanceNotification> {
    // Check for duplicate notification before creating
    const { recipient_address, notification_type, proposal_id } = notificationData;
    if (proposal_id) {
      const { data: existing, error } = await supabase
        .from('governance_notifications')
        .select('*')
        .eq('recipient_address', recipient_address.toLowerCase())
        .eq('notification_type', notification_type)
        .eq('proposal_id', proposal_id)
        .maybeSingle();
      if (existing) {
        // Duplicate found, return existing notification (full row)
        return existing as GovernanceNotification;
      }
    }
    // Creating governance notification via API
    
    const response = await fetch('/api/governance-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error creating governance notification:', errorData);
      throw new Error(errorData.error || 'Failed to create notification');
    }

    const result = await response.json();
    // Governance notification created via API
    return result.data;
  },

  // Get governance notifications for a user
  async getNotificationsForUser(recipientAddress: string, limit = 50): Promise<GovernanceNotification[]> {
    const { data, error } = await supabase
      .from('governance_notifications')
      .select('*')
      .eq('recipient_address', recipientAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching governance notifications:', error);
      throw error;
    }

    return data || [];
  },

  // Get unread governance notifications for a user
  async getUnreadNotifications(recipientAddress: string): Promise<GovernanceNotification[]> {
    const { data, error } = await supabase
      .from('governance_notifications')
      .select('*')
      .eq('recipient_address', recipientAddress.toLowerCase())
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unread governance notifications:', error);
      throw error;
    }

    return data || [];
  },

  // Mark governance notification as read
  async markNotificationAsRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('governance_notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking governance notification as read:', error);
      throw error;
    }
  },

  // Mark all governance notifications as read for a user
  async markAllNotificationsAsRead(recipientAddress: string): Promise<void> {
    const { error } = await supabase
      .from('governance_notifications')
      .update({ is_read: true })
      .eq('recipient_address', recipientAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all governance notifications as read:', error);
      throw error;
    }
  },

  // Mark all notifications for a proposal as read (when user votes)
  async markAllNotificationsForProposalAsRead(proposalId: string): Promise<void> {
    const { error } = await supabase
      .from('governance_notifications')
      .update({ is_read: true })
      .eq('proposal_id', proposalId)
      .eq('is_read', false);
    if (error) {
      console.error('Error marking notifications as read for proposal:', error);
      throw error;
    }
  },

  // Mark all notifications for a proposal as read for a specific user (when user votes)
  async markAllNotificationsForProposalAsReadForUser(proposalId: string, userAddress: string): Promise<void> {
    const { error } = await supabase
      .from('governance_notifications')
      .update({ is_read: true })
      .eq('proposal_id', proposalId)
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false);
    if (error) {
      console.error('Error marking notifications as read for proposal and user:', error);
      throw error;
    }
  },

  // Get unread governance notification count
  async getUnreadNotificationCount(recipientAddress: string): Promise<number> {
    const { count, error } = await supabase
      .from('governance_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', recipientAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Error fetching unread governance notification count:', error);
      throw error;
    }

    return count || 0;
  },

  // Get unread governance notification count for active proposals only
  async getUnreadNotificationCountForActiveProposals(recipientAddress: string): Promise<number> {
    try {
      // Get unread notifications with proposal_id
      const { data: unreadNotifications, error: notificationsError } = await supabase
        .from('governance_notifications')
        .select('id, proposal_id')
        .eq('recipient_address', recipientAddress.toLowerCase())
        .eq('is_read', false)
        .not('proposal_id', 'is', null);

      if (notificationsError) {
        console.error('Error fetching unread notifications:', notificationsError);
        throw notificationsError;
      }

      if (!unreadNotifications || unreadNotifications.length === 0) {
        return 0;
      }

      // Get proposal IDs from unread notifications
      const proposalIds = unreadNotifications
        .map(n => n.proposal_id)
        .filter(Boolean);

      if (proposalIds.length === 0) {
        return 0;
      }

      // Check which proposals are still active using proposal_metadata
      const { data: activeProposals, error: proposalsError } = await supabase
        .from('proposal_metadata')
        .select('onchain_proposal_id, status')
        .in('onchain_proposal_id', proposalIds)
        .eq('status', 'active');
      if (proposalsError) {
        console.error('Error fetching active proposals:', proposalsError);
        // If error, return 0 to be safe
        return 0;
      }

      // Get the IDs of active proposals
      const activeProposalIds = activeProposals?.map(p => p.onchain_proposal_id) || [];

      // Count notifications for active proposals only
      const activeNotificationCount = unreadNotifications.filter(n => 
        activeProposalIds.includes(n.proposal_id)
      ).length;

      // Mark notifications for inactive proposals as read
      const inactiveProposalIds = proposalIds.filter(id => !activeProposalIds.includes(id));
      if (inactiveProposalIds.length > 0) {
        await this.markNotificationsForInactiveProposalsAsRead(inactiveProposalIds);
      }

      return activeNotificationCount;
    } catch (error) {
      console.error('Error getting unread notification count for active proposals:', error);
      // Return 0 on error to be safe
      return 0;
    }
  },

  // Mark notifications for inactive proposals as read
  async markNotificationsForInactiveProposalsAsRead(proposalIds: string[]): Promise<void> {
    if (proposalIds.length === 0) return;

    const { error } = await supabase
      .from('governance_notifications')
      .update({ is_read: true })
      .in('proposal_id', proposalIds)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking notifications for inactive proposals as read:', error);
      // Dont throw, just log the error
    }
  },

  // Get unread notifications for active proposals only
  async getUnreadNotificationsForActiveProposals(recipientAddress: string): Promise<GovernanceNotification[]> {
    try {
      // Get unread notifications with proposal_id
      const { data: unreadNotifications, error: notificationsError } = await supabase
        .from('governance_notifications')
        .select('*')
        .eq('recipient_address', recipientAddress.toLowerCase())
        .eq('is_read', false)
        .not('proposal_id', 'is', null)
        .order('created_at', { ascending: false });

      if (notificationsError) {
        console.error('Error fetching unread notifications:', notificationsError);
        throw notificationsError;
      }

      if (!unreadNotifications || unreadNotifications.length === 0) {
        return [];
      }

      // Get proposal IDs from unread notifications
      const proposalIds = unreadNotifications
        .map(n => n.proposal_id)
        .filter(Boolean);

      if (proposalIds.length === 0) {
        return [];
      }

      // Check which proposals are still active using proposal_metadata
      const { data: activeProposals, error: proposalsError } = await supabase
        .from('proposal_metadata')
        .select('onchain_proposal_id, status')
        .in('onchain_proposal_id', proposalIds)
        .eq('status', 'active');
      if (proposalsError) {
        console.error('Error fetching active proposals:', proposalsError);
        // If error, return empty array to be safe
        return [];
      }

      // Get the IDs of active proposals
      const activeProposalIds = activeProposals?.map(p => p.onchain_proposal_id) || [];

      // Filter notifications for active proposals only
      const activeNotifications = unreadNotifications.filter(n => 
        activeProposalIds.includes(n.proposal_id)
      );

      // Mark notifications for inactive proposals as read
      const inactiveProposalIds = proposalIds.filter(id => !activeProposalIds.includes(id));
      if (inactiveProposalIds.length > 0) {
        await this.markNotificationsForInactiveProposalsAsRead(inactiveProposalIds);
      }

      return activeNotifications;
    } catch (error) {
      console.error('Error getting unread notifications for active proposals:', error);
      // Return empty array on error to be safe
      return [];
    }
  },

  // Create proposal mention notification
  async createProposalMentionNotification(
    recipientAddress: string,
    senderAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ): Promise<GovernanceNotification> {
    // Creating proposal mention notification

    const senderProfile = await this.getUserProfile(senderAddress);
    const senderName = senderProfile ? 
      `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 
      senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4) :
      senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4);

    const notificationData = {
      recipient_address: recipientAddress.toLowerCase(),
      sender_address: senderAddress.toLowerCase(),
      notification_type: 'proposal_mentioned',
      title: 'You were mentioned in a proposal',
      message: `${senderName} mentioned you in proposal: "${proposalTitle}"`,
      context_url: `/vote/${proposalId}`,
      context_type: 'governance',
      context_id: proposalId,
      proposal_id: proposalId,
      transaction_hash: transactionHash
    };

    // Governance notification data prepared

    const result = await this.createNotification(notificationData);
    // Governance notification created successfully
    return result;
  },

  // Create proposal created notification
  async createProposalCreatedNotification(
    proposerAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ): Promise<GovernanceNotification> {
    const proposerProfile = await this.getUserProfile(proposerAddress);
    const proposerName = proposerProfile ? 
      `${proposerProfile.first_name || ''} ${proposerProfile.last_name || ''}`.trim() || 
      proposerAddress.slice(0, 6) + '...' + proposerAddress.slice(-4) :
      proposerAddress.slice(0, 6) + '...' + proposerAddress.slice(-4);

    const notificationData = {
      recipient_address: proposerAddress.toLowerCase(),
      sender_address: proposerAddress.toLowerCase(),
      notification_type: 'proposal_created',
      title: 'Proposal Created Successfully',
      message: `Your proposal "${proposalTitle}" has been created and is now open for voting`,
      context_url: `/vote/${proposalId}`,
      context_type: 'governance',
      context_id: proposalId,
      proposal_id: proposalId,
      transaction_hash: transactionHash
    };

    return await this.createNotification(notificationData);
  },

  // Get user profile for notification display
  async getUserProfile(walletAddress: string) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      return null;
    }
  },

  // Get all token holders for a specific token using fetchTokenBalances
  async getTokenHolders(tokenId: string): Promise<string[]> {
    try {
      // Fetching token holders for token
      
      // Get all users from user_profiles table
      const { data: users, error } = await supabase
        .from('user_profiles')
        .select('wallet_address');

      if (error) {
        console.error('Error fetching users:', error);
        return [];
      }

      if (!users || users.length === 0) {
        return [];
      }

      // Check token balances for each user
      const tokenHolders: string[] = [];
      const { fetchTokenBalances } = await import('./fetchTokenBalances');

      // Process users in batches to avoid rate limiting
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (user) => {
            try {
              const balances = await fetchTokenBalances(user.wallet_address);
              
              // Check if user has the required token
              let hasToken = false;
              switch (tokenId) {
                case 'exec':
                  hasToken = balances.hasExecutivePod;
                  break;
                case 'dev':
                  hasToken = balances.hasDevPod;
                  break;
                case 'poc':
                  hasToken = balances.hasProofOfCuriosity;
                  break;
                case 'market':
                  hasToken = balances.hasMarketAdmin;
                  break;
                case 'bounty':
                  hasToken = balances.hasBountyHat;
                  break;
                default:
                  hasToken = false;
              }
              
              if (hasToken) {
                tokenHolders.push(user.wallet_address);
              }
            } catch (error) {
              console.error(`Error checking balance for ${user.wallet_address}:`, error);
            }
          })
        );
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Found token holders
      return tokenHolders;
    } catch (error) {
      console.error('Error in getTokenHolders:', error);
      return [];
    }
  },

  // Create notifications for all token holders
  async createTokenHolderNotifications(
    tokenId: string,
    senderAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ): Promise<void> {
    try {
      // Creating token holder notifications for token
      
      const tokenHolders = await this.getTokenHolders(tokenId);
      // Found token holders count

      if (tokenHolders.length === 0) {
        // No token holders found for token
        return;
      }

      const senderProfile = await this.getUserProfile(senderAddress);
      const senderName = senderProfile ? 
        `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 
        senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4) :
        senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4);

      // Get token name for display
      const tokenNames: Record<string, string> = {
        'exec': 'Executive Pod',
        'dev': 'Dev Pod', 
        'poc': 'Proof of Curiosity',
        'market': 'Market Admin',
        'bounty': 'Bounty Hat'
      };
      const tokenName = tokenNames[tokenId] || tokenId;

      // Create notifications for all token holders (excluding the sender)
      const notificationPromises = tokenHolders
        .filter(holder => holder.toLowerCase() !== senderAddress.toLowerCase())
        .map(async (holderAddress) => {
          const notificationData = {
            recipient_address: holderAddress.toLowerCase(),
            sender_address: senderAddress.toLowerCase(),
            notification_type: 'token_holder_notification' as const,
            title: 'New Proposal Requires Your Vote',
            message: `${senderName} created a proposal "${proposalTitle}" that requires ${tokenName} token holders to vote.`,
            context_url: `/vote/${proposalId}`,
            context_type: 'governance',
            context_id: proposalId,
            proposal_id: proposalId,
            transaction_hash: transactionHash
          };

          try {
            await this.createNotification(notificationData);
            // Token holder notification sent
          } catch (error) {
            console.error(`❌ Failed to send notification to ${holderAddress}:`, error);
          }
        });

      await Promise.all(notificationPromises);
      // Token holder notifications completed
    } catch (error) {
      console.error('Error creating token holder notifications:', error);
    }
  },

  // Remove all notifications for a proposal
  async removeNotificationsForProposal(proposalId: string): Promise<void> {
    const { error } = await supabase
      .from('governance_notifications')
      .delete()
      .eq('proposal_id', proposalId);
    if (error) {
      console.error('Error removing notifications for proposal:', error);
      throw error;
    }
  },

  // Check if user has already voted on a proposal
  async hasUserVotedOnProposal(userAddress: string, proposalId: string): Promise<boolean> {
    try {
      // Fetch all proposal states for this user
      const res = await fetch(`/api/proposalStates?user=${userAddress}`);
      if (!res.ok) throw new Error('Failed to fetch proposal states');
      const data = await res.json();
      // proposalId may be hex or decimal, so check both
      const hasVoted = data[proposalId]?.hasVoted;
      if (typeof hasVoted === 'boolean') return hasVoted;
      // Try string conversion fallback
      const alt = data[String(proposalId)]?.hasVoted;
      if (typeof alt === 'boolean') return alt;
      return false;
    } catch (error) {
      console.error('Error checking if user has voted (API):', error);
      // If error, assume user hasn't voted (fail open)
      return false;
    }
  },

  // Get unread notifications for active proposals that user hasn't voted on
  async getUnreadNotificationsForVotableProposals(recipientAddress: string): Promise<GovernanceNotification[]> {
    try {
      // Get all unread notifications with a proposal_id
      const { data: unreadNotifications, error } = await supabase
        .from('governance_notifications')
        .select('*')
        .eq('recipient_address', recipientAddress.toLowerCase())
        .eq('is_read', false)
        .not('proposal_id', 'is', null);

      if (error) {
        console.error('Error fetching unread notifications:', error);
        return [];
      }

      if (!unreadNotifications || unreadNotifications.length === 0) {
        return [];
      }

      // Fetch all proposal states for this user once
      const res = await fetch(`/api/proposalStates?user=${recipientAddress}`);
      const data = res.ok ? await res.json() : {};

      // Deduplicate by proposal_id: only keep the first notification for each proposal
      const seen = new Set();
      const dedupedNotifications: GovernanceNotification[] = [];
      for (const notification of unreadNotifications) {
        if (!notification.proposal_id) continue;
        if (seen.has(notification.proposal_id)) continue;
        const stateObj = data[notification.proposal_id];
        if (stateObj && stateObj.state === 1 && !stateObj.hasVoted) {
          dedupedNotifications.push(notification);
          seen.add(notification.proposal_id);
        } else {
          // Mark notification as read if not votable
          await this.markNotificationAsRead(notification.id);
        }
      }
      return dedupedNotifications;
    } catch (error) {
      console.error('Error getting votable notifications (API):', error);
      return [];
    }
  },

  // Get unread notification count for active proposals that user hasn't voted on
  async getUnreadNotificationCountForVotableProposals(recipientAddress: string): Promise<number> {
    try {
      const votableNotifications = await this.getUnreadNotificationsForVotableProposals(recipientAddress);
      // Deduplicate by proposal_id
      const uniqueProposalIds = new Set(votableNotifications.map(n => n.proposal_id));
      return uniqueProposalIds.size;
    } catch (error) {
      console.error('Error getting votable notification count (API):', error);
      return 0;
    }
  }
}; 