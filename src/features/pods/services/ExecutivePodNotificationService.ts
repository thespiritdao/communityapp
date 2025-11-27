'use client';

import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';

// Environment variables for executive tokens
const EXECUTIVE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_EXECUTIVE_TOKEN || '0x1234567890abcdef';

export interface ExecutiveNotificationData {
  type: 'pod_approval_request';
  podId: string;
  podName: string;
  podDescription: string;
  createdBy: string;
  parentPodName: string;
  podLeads: string[];
  contextUrl: string;
}

export class ExecutivePodNotificationService {
  /**
   * Get all addresses that hold executive pod tokens
   */
  static async getExecutivePodHolders(): Promise<string[]> {
    try {
      // First, get all unique addresses from recent transactions and database records
      const uniqueAddresses = new Set<string>();
      
      // Get addresses from pod creation records
      const { data: pods } = await supabase
        .from('pods')
        .select('created_by_address, pod_leads')
        .not('created_by_address', 'is', null);

      if (pods) {
        pods.forEach(pod => {
          if (pod.created_by_address) {
            uniqueAddresses.add(pod.created_by_address.toLowerCase());
          }
          if (Array.isArray(pod.pod_leads)) {
            pod.pod_leads.forEach((lead: string) => {
              if (lead) uniqueAddresses.add(lead.toLowerCase());
            });
          }
        });
      }

      // Get addresses from governance notifications (active users)
      const { data: notifications } = await supabase
        .from('governance_notifications')
        .select('recipient_address')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .not('recipient_address', 'is', null);

      if (notifications) {
        notifications.forEach(notif => {
          if (notif.recipient_address) {
            uniqueAddresses.add(notif.recipient_address.toLowerCase());
          }
        });
      }

      // Convert to array for balance checking
      const addressArray = Array.from(uniqueAddresses);
      
      if (addressArray.length === 0) {
        console.warn('No addresses found for executive token balance checking');
        return [];
      }

      // Check balances for all addresses
      console.log(`🏛️ Checking executive token balances for ${addressArray.length} addresses...`);
      
      const executiveHolders: string[] = [];
      
      // Process in batches to avoid overwhelming the RPC
      const batchSize = 10;
      for (let i = 0; i < addressArray.length; i += batchSize) {
        const batch = addressArray.slice(i, i + batchSize);
        const batchAddresses = Array.from(batch);
        
        try {
          const balances = await fetchTokenBalances(
            batchAddresses[0], // This function expects single address, so we'll call it for each
            [EXECUTIVE_TOKEN_ADDRESS]
          );

          // For each address in the batch, check if they have executive tokens
          for (let j = 0; j < batchAddresses.length; j++) {
            try {
              const individualBalances = await fetchTokenBalances(
                batchAddresses[j],
                [EXECUTIVE_TOKEN_ADDRESS]
              );
              
              if (individualBalances.length > 0 && Number.parseFloat(individualBalances[0]) > 0) {
                executiveHolders.push(batchAddresses[j]);
                console.log(`✅ Executive token holder found: ${batchAddresses[j]} (Balance: ${individualBalances[0]})`);
              }
            } catch (error) {
              console.warn(`Failed to check balance for ${batchAddresses[j]}:`, error);
            }
          }
        } catch (error) {
          console.error('Error checking batch balances:', error);
        }
      }

      console.log(`🏛️ Found ${executiveHolders.length} executive pod token holders`);
      return executiveHolders;

    } catch (error) {
      console.error('Error getting executive pod holders:', error);
      return [];
    }
  }

  /**
   * Send governance notifications to all executive pod holders
   */
  static async notifyExecutivePodHolders(notificationData: ExecutiveNotificationData): Promise<void> {
    try {
      const executiveHolders = await this.getExecutivePodHolders();
      
      if (executiveHolders.length === 0) {
        console.warn('No executive pod holders found to notify');
        return;
      }

      console.log(`🔔 Sending pod approval notifications to ${executiveHolders.length} executive holders`);

      // Create notification records for each executive holder
      const notifications = executiveHolders.map(holderAddress => ({
        recipient_address: holderAddress,
        sender_address: notificationData.createdBy,
        notification_type: 'pod_approval_request',
        title: `New Pod Approval Required: ${notificationData.podName}`,
        message: `A new pod "${notificationData.podName}" has been created and requires executive approval.\n\nDescription: ${notificationData.podDescription}\n\nParent Pod: ${notificationData.parentPodName}\nPod Leads: ${notificationData.podLeads.join(', ')}\n\nCreated by: ${notificationData.createdBy}\n\nPlease review and vote on this proposal in the governance section.`,
        context_url: notificationData.contextUrl,
        context_type: 'pod_governance',
        context_id: notificationData.podId,
        proposal_id: notificationData.podId,
        is_read: false
      }));

      // Insert all notifications in batch
      const { error } = await supabase
        .from('governance_notifications')
        .insert(notifications);

      if (error) {
        console.error('Error inserting governance notifications:', error);
        throw error;
      }

      console.log(`✅ Successfully sent ${notifications.length} pod approval notifications`);

    } catch (error) {
      console.error('Error notifying executive pod holders:', error);
      throw error;
    }
  }

  /**
   * Send notification when a pod is approved or rejected
   */
  static async notifyPodStatusUpdate(
    podId: string,
    podName: string,
    status: 'approved' | 'rejected',
    createdBy: string,
    approvedBy?: string
  ): Promise<void> {
    try {
      const notification = {
        recipient_address: createdBy,
        sender_address: approvedBy || 'system',
        notification_type: status === 'approved' ? 'proposal_executed' : 'proposal_cancelled',
        title: `Pod ${status === 'approved' ? 'Approved' : 'Rejected'}: ${podName}`,
        message: status === 'approved' 
          ? `Congratulations! Your pod "${podName}" has been approved by executive governance and is now active. You can now begin using all pod features including treasury management, event creation, and member management.`
          : `Your pod "${podName}" has been rejected by executive governance. Please review the feedback and consider resubmitting with requested changes.`,
        context_url: `/pods/${podId}`,
        context_type: 'pod_governance',
        context_id: podId,
        proposal_id: podId,
        is_read: false
      };

      const { error } = await supabase
        .from('governance_notifications')
        .insert(notification);

      if (error) {
        console.error('Error inserting pod status notification:', error);
        throw error;
      }

      console.log(`✅ Sent pod ${status} notification to creator: ${createdBy}`);

    } catch (error) {
      console.error('Error notifying pod status update:', error);
      throw error;
    }
  }

  /**
   * Get pending pod approval notifications for a user
   */
  static async getPendingPodApprovals(userAddress: string): Promise<any[]> {
    try {
      // Check if user is an executive holder first
      const executiveHolders = await this.getExecutivePodHolders();
      if (!executiveHolders.includes(userAddress.toLowerCase())) {
        return [];
      }

      const { data, error } = await supabase
        .from('governance_notifications')
        .select('*')
        .eq('recipient_address', userAddress.toLowerCase())
        .eq('notification_type', 'pod_approval_request')
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending pod approvals:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('Error getting pending pod approvals:', error);
      return [];
    }
  }

  /**
   * Mark pod approval notification as read
   */
  static async markPodApprovalAsRead(notificationId: string, userAddress: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('governance_notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('recipient_address', userAddress.toLowerCase());

      if (error) {
        console.error('Error marking notification as read:', error);
        throw error;
      }

    } catch (error) {
      console.error('Error marking pod approval as read:', error);
      throw error;
    }
  }
}