import { supabase } from './supabaseClient';

export interface GeneralNotification {
  id: string;
  recipient_address: string;
  sender_address: string;
  notification_type: 'user_mentioned' | 'forum_reply' | 'chat_message' | 'bounty_update' | 'proposal_executed' | 'purchase_completed';
  title: string;
  message: string;
  context_url?: string;
  context_type?: 'forum' | 'chat' | 'bounty' | 'governance' | 'marketplace';
  context_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface CreateNotificationData {
  recipient_address: string;
  sender_address: string;
  notification_type: 'user_mentioned' | 'forum_reply' | 'chat_message' | 'bounty_update' | 'proposal_executed' | 'purchase_completed';
  title: string;
  message: string;
  context_url?: string;
  context_type?: 'forum' | 'chat' | 'bounty' | 'governance' | 'marketplace';
  context_id?: string;
}

export const notificationService = {
  // Create a notification
  async createNotification(notificationData: CreateNotificationData): Promise<GeneralNotification> {
    console.log('Attempting to create notification in database:', notificationData);
    
    try {
      const { data, error } = await supabase
        .from('general_notifications')
        .insert([notificationData])
        .select()
        .single();

      if (error) {
        console.error('Database error creating notification:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      if (!data) {
        console.error('No data returned from notification insert');
        throw new Error('No data returned from notification insert');
      }

      console.log('Notification created successfully in database:', data);
      return data;
    } catch (error) {
      console.error('Exception during notification creation:', error);
      throw error;
    }
  },

  // Get notifications for a user
  async getNotificationsForUser(recipientAddress: string, limit = 50): Promise<GeneralNotification[]> {
    console.log('Fetching notifications for user:', recipientAddress);
    
    const { data, error } = await supabase
      .from('general_notifications')
      .select('*')
      .eq('recipient_address', recipientAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} notifications for user ${recipientAddress}`);
    return data || [];
  },

  // Get unread notifications for a user
  async getUnreadNotifications(recipientAddress: string): Promise<GeneralNotification[]> {
    const { data, error } = await supabase
      .from('general_notifications')
      .select('*')
      .eq('recipient_address', recipientAddress)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unread notifications:', error);
      throw error;
    }

    return data || [];
  },

  // Mark notification as read
  async markNotificationAsRead(id: string): Promise<void> {
    console.log('NotificationService: Marking notification as read:', id);
    
    try {
      const { data, error } = await supabase
        .from('general_notifications')
        .update({ is_read: true })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Database error marking notification as read:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          id
        });
        throw error;
      }

      console.log('NotificationService: Successfully marked notification as read:', data);
    } catch (error) {
      console.error('Exception marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read for a user
  async markAllNotificationsAsRead(recipientAddress: string): Promise<void> {
    console.log('NotificationService: Marking all notifications as read for:', recipientAddress);
    
    try {
      const { data, error } = await supabase
        .from('general_notifications')
        .update({ is_read: true })
        .eq('recipient_address', recipientAddress.toLowerCase())
        .eq('is_read', false)
        .select();

      if (error) {
        console.error('Database error marking all notifications as read:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          recipientAddress
        });
        throw error;
      }

      console.log('NotificationService: Successfully marked all notifications as read:', data);
      console.log(`NotificationService: Updated ${data?.length || 0} notifications`);
    } catch (error) {
      console.error('Exception marking all notifications as read:', error);
      throw error;
    }
  },

  // Get unread notification count
  async getUnreadNotificationCount(recipientAddress: string): Promise<number> {
    console.log('Fetching unread count for user:', recipientAddress);
    
    const { count, error } = await supabase
      .from('general_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', recipientAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Error fetching unread notification count:', error);
      throw error;
    }

    console.log(`Found ${count || 0} unread notifications for user ${recipientAddress}`);
    return count || 0;
  },

  // Create user mention notification
  async createUserMentionNotification(
    recipientAddress: string,
    senderAddress: string,
    contextType: 'forum' | 'chat' | 'bounty',
    contextId: string,
    contextUrl?: string
  ): Promise<GeneralNotification> {
    console.log('Creating user mention notification:', {
      recipientAddress,
      senderAddress,
      contextType,
      contextId,
      contextUrl
    });

    const senderProfile = await this.getUserProfile(senderAddress);
    const senderName = senderProfile ? 
      `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 
      senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4) :
      senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4);

    const contextTypeLabel = {
      forum: 'forum post',
      chat: 'chat message',
      bounty: 'bounty'
    }[contextType];

    const notificationData = {
      recipient_address: recipientAddress,
      sender_address: senderAddress,
      notification_type: 'user_mentioned',
      title: 'You were mentioned',
      message: `${senderName} mentioned you in a ${contextTypeLabel}`,
      context_url: contextUrl,
      context_type: contextType,
      context_id: contextId
    };

    console.log('Notification data to insert:', notificationData);

    const result = await this.createNotification(notificationData);
    console.log('Notification created successfully:', result);
    return result;
  },

  // Create proposal executed notification
  async createProposalExecutedNotification(
    recipientAddress: string,
    senderAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ): Promise<GeneralNotification> {
    const notificationData = {
      recipient_address: recipientAddress,
      sender_address: senderAddress,
      notification_type: 'proposal_executed',
      title: 'Proposal Executed',
      message: `The proposal "${proposalTitle}" has been executed onchain.`,
      context_url: `/vote/${proposalId}`,
      context_type: 'governance',
      context_id: proposalId
    };
    return await this.createNotification(notificationData);
  },

  // Create purchase notification for fulfillment managers
  async createPurchaseNotification(
    buyerAddress: string,
    productName: string,
    productId: string,
    requiredToken: string | null,
    transactionHash?: string
  ): Promise<void> {
    console.log('🔔 Creating purchase notifications for fulfillment managers:', {
      buyerAddress,
      productName,
      productId,
      requiredToken,
      transactionHash
    });

    try {
      // Get buyer profile for notification message
      const buyerProfile = await this.getUserProfile(buyerAddress);
      const buyerName = buyerProfile ? 
        `${buyerProfile.first_name || ''} ${buyerProfile.last_name || ''}`.trim() || 
        buyerAddress.slice(0, 6) + '...' + buyerAddress.slice(-4) :
        buyerAddress.slice(0, 6) + '...' + buyerAddress.slice(-4);

      // Find fulfillment managers who should receive notifications
      const managers = await this.getFulfillmentManagers(requiredToken);
      
      console.log(`Found ${managers.length} fulfillment managers for notifications`);

      // Create notifications for each manager
      console.log('🔔 Final list of managers who will receive notifications:', managers.map(m => m.wallet_address));
      
      const notificationPromises = managers.map(async (manager, index) => {
        const notificationData = {
          recipient_address: manager.wallet_address,
          sender_address: buyerAddress,
          notification_type: 'purchase_completed' as const,
          title: 'Product Purchase Requires Fulfillment',
          message: `${buyerName} has purchased "${productName}". Please begin the process of facilitating the delivery of the item.`,
          context_url: `/marketplace/orders/${productId}`,
          context_type: 'marketplace' as const,
          context_id: productId
        };

        console.log(`🔔 Creating notification ${index + 1}/${managers.length} for manager:`, manager.wallet_address);
        return await this.createNotification(notificationData);
      });

      await Promise.all(notificationPromises);
      console.log('All purchase notifications created successfully');
    } catch (error) {
      console.error('Error creating purchase notifications:', error);
      throw error;
    }
  },

  // Get fulfillment managers based on product token requirements
  async getFulfillmentManagers(requiredToken: string | null): Promise<Array<{wallet_address: string}>> {
    console.log('Finding fulfillment managers for token:', requiredToken);

    try {
      // Import fetchTokenBalances to check manager token holdings
      const { fetchTokenBalances } = await import('./fetchTokenBalances');
      
      // Get all user profiles
      const { data: allUsers, error: usersError } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .not('wallet_address', 'is', null);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      if (!allUsers?.length) {
        console.log('No users found in database');
        return [];
      }

      console.log(`🔍 Checking ${allUsers.length} users for fulfillment manager eligibility`);

      // Check each user's token holdings
      const managerPromises = allUsers.map(async (user) => {
        try {
          console.log(`🔍 Checking user ${user.wallet_address} for manager eligibility`);
          const balances = await fetchTokenBalances(user.wallet_address);
          console.log(`📊 Token balances for ${user.wallet_address}:`, balances);
          
          // Must hold market management token (NEXT_PUBLIC_MARKET_MANAGEMENT)
          const hasMarketManagement = balances.hasMarketManagement;
          console.log(`🏪 Has market management token: ${hasMarketManagement}`);
          
          // Must hold the pod-specific token for the product (if product has token requirement)
          let hasPodToken = true; // Default true for products with no token requirement
          
          if (requiredToken) {
            switch (requiredToken) {
              case 'exec':
                hasPodToken = balances.hasExecutivePod;
                console.log(`🔍 Checking exec pod for ${user.wallet_address}: ${hasPodToken}`);
                break;
              case 'dev':
                hasPodToken = balances.hasDevPod;
                console.log(`🔍 Checking dev pod for ${user.wallet_address}: ${hasPodToken}`);
                break;
              case 'bounty':
                hasPodToken = balances.hasBountyHat;
                console.log(`🔍 Checking bounty hat for ${user.wallet_address}: ${hasPodToken}`);
                break;
              case 'curiosity':
                hasPodToken = balances.hasProofOfCuriosity;
                console.log(`🔍 Checking curiosity token for ${user.wallet_address}: ${hasPodToken}`);
                break;
              case 'market_admin':
                hasPodToken = balances.hasMarketManagement;
                console.log(`🔍 Checking market admin for ${user.wallet_address}: ${hasPodToken}`);
                break;
              default:
                hasPodToken = false;
                console.log(`🔍 Unknown required token: ${requiredToken}`);
            }
          } else {
            console.log(`🔍 No required token specified, defaulting hasPodToken to true`);
          }

          // User qualifies if they have both market management AND the pod-specific token
          const qualifies = hasMarketManagement && hasPodToken;
          
          console.log(`👤 User ${user.wallet_address}: marketMgmt=${hasMarketManagement}, podToken=${hasPodToken} (${requiredToken}), qualifies=${qualifies}`);
          
          return qualifies ? user : null;
        } catch (error) {
          console.error(`Error checking tokens for user ${user.wallet_address}:`, error);
          return null;
        }
      });

      const results = await Promise.all(managerPromises);
      const managers = results.filter(Boolean) as Array<{wallet_address: string}>;
      
      console.log(`✅ Found ${managers.length} qualified fulfillment managers:`, managers.map(m => m.wallet_address));
      return managers;
    } catch (error) {
      console.error('Error finding fulfillment managers:', error);
      throw error;
    }
  },

  // Get user profile for notification display
  async getUserProfile(walletAddress: string) {
    console.log('Fetching user profile for:', walletAddress);
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('wallet_address', walletAddress)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        console.error('Profile fetch error details:', {
          code: error.code,
          message: error.message,
          walletAddress
        });
        return null;
      }

      console.log('User profile fetched successfully:', data);
      return data;
    } catch (error) {
      console.error('Exception during user profile fetch:', error);
      return null;
    }
  }
}; 