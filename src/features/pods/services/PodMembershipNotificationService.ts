/**
 * Pod Membership Notification Service
 *
 * Handles notifications for pod membership events like new members joining
 */

import { supabase } from '@/utils/supabaseClient';

export interface NotifyExecPodParams {
  newMemberAddress: string;
  newMemberName?: string;
  podId: string;
  podName: string;
  roleLabel: string; // "member" or "leader"
}

/**
 * Notify exec pod members when a new member joins any pod
 */
export async function notifyExecPodOfNewMember({
  newMemberAddress,
  newMemberName,
  podId,
  podName,
  roleLabel,
}: NotifyExecPodParams): Promise<void> {
  try {
    console.log('📨 Notifying exec pod of new member:', { podName, newMemberAddress, roleLabel });

    // Find the "Exec" pod - it should have a specific identifier
    // Option 1: Query by name
    const { data: execPod, error: execPodError } = await supabase
      .from('pods')
      .select('id, name, pod_leads')
      .ilike('name', '%exec%')
      .maybeSingle();

    if (execPodError) {
      console.error('Error finding exec pod:', execPodError);
      return;
    }

    if (!execPod) {
      console.log('⚠️ Exec pod not found, skipping notification');
      return;
    }

    console.log('✅ Found exec pod:', execPod.name, 'with leads:', execPod.pod_leads);

    // Get all exec pod members (pod_leads)
    const execMembers = execPod.pod_leads || [];

    if (execMembers.length === 0) {
      console.log('⚠️ No exec pod members found');
      return;
    }

    // Create notifications for each exec member
    const notifications = execMembers.map((memberAddress: string) => ({
      recipient_address: memberAddress.toLowerCase(),
      sender_address: newMemberAddress.toLowerCase(),
      notification_type: 'pod_member_joined',
      title: `New ${roleLabel} joined ${podName}`,
      message: newMemberName
        ? `${newMemberName} has joined ${podName} as a ${roleLabel}.`
        : `A new ${roleLabel} has joined ${podName}.`,
      context_type: 'governance',
      context_id: podId,
      context_url: `/pods/${podId}`,
      priority: 'medium',
    }));

    // Insert all notifications
    const { data, error } = await supabase
      .from('general_notifications')
      .insert(notifications)
      .select();

    if (error) {
      console.error('❌ Error creating exec notifications:', error);
    } else {
      console.log(`✅ Created ${data?.length || 0} notifications for exec pod members`);
    }
  } catch (error) {
    console.error('❌ Error in notifyExecPodOfNewMember:', error);
  }
}

/**
 * Notify pod leaders when a new member joins their pod
 */
export async function notifyPodLeadersOfNewMember({
  newMemberAddress,
  newMemberName,
  podId,
  podName,
  roleLabel,
}: NotifyExecPodParams): Promise<void> {
  try {
    console.log('📨 Notifying pod leaders of new member:', { podName, newMemberAddress, roleLabel });

    // Get the pod and its leaders
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('id, name, pod_leads')
      .eq('id', podId)
      .maybeSingle();

    if (podError || !pod) {
      console.error('Error finding pod:', podError);
      return;
    }

    const podLeaders = pod.pod_leads || [];

    if (podLeaders.length === 0) {
      console.log('⚠️ No pod leaders found');
      return;
    }

    // Create notifications for each pod leader
    const notifications = podLeaders
      .filter((leaderAddress: string) => leaderAddress.toLowerCase() !== newMemberAddress.toLowerCase())
      .map((leaderAddress: string) => ({
        recipient_address: leaderAddress.toLowerCase(),
        sender_address: newMemberAddress.toLowerCase(),
        notification_type: 'pod_member_joined',
        title: `New ${roleLabel} joined your pod`,
        message: newMemberName
          ? `${newMemberName} has joined ${podName} as a ${roleLabel}.`
          : `A new ${roleLabel} has joined ${podName}.`,
        context_type: 'governance',
        context_id: podId,
        context_url: `/pods/${podId}`,
        priority: 'low',
      }));

    if (notifications.length === 0) {
      console.log('⚠️ No notifications to send (member is the only leader or no other leaders)');
      return;
    }

    // Insert all notifications
    const { data, error } = await supabase
      .from('general_notifications')
      .insert(notifications)
      .select();

    if (error) {
      console.error('❌ Error creating pod leader notifications:', error);
    } else {
      console.log(`✅ Created ${data?.length || 0} notifications for pod leaders`);
    }
  } catch (error) {
    console.error('❌ Error in notifyPodLeadersOfNewMember:', error);
  }
}

export interface NotifyNewAccountParams {
  newUserAddress: string;
  newUserEmail?: string;
}

/**
 * Notify exec pod members when a new account is created
 */
export async function notifyExecPodOfNewAccount({
  newUserAddress,
  newUserEmail,
}: NotifyNewAccountParams): Promise<void> {
  try {
    console.log('📨 Notifying exec pod of new account:', { newUserAddress, newUserEmail });

    // Find the "Exec" pod
    const { data: execPod, error: execPodError } = await supabase
      .from('pods')
      .select('id, name, pod_leads')
      .ilike('name', '%exec%')
      .maybeSingle();

    if (execPodError) {
      console.error('Error finding exec pod:', execPodError);
      return;
    }

    if (!execPod) {
      console.log('⚠️ Exec pod not found, skipping notification');
      return;
    }

    console.log('✅ Found exec pod:', execPod.name, 'with leads:', execPod.pod_leads);

    // Get all exec pod members (pod_leads)
    const execMembers = execPod.pod_leads || [];

    if (execMembers.length === 0) {
      console.log('⚠️ No exec pod members found');
      return;
    }

    // Create notifications for each exec member
    const notifications = execMembers.map((memberAddress: string) => ({
      recipient_address: memberAddress.toLowerCase(),
      sender_address: newUserAddress.toLowerCase(),
      notification_type: 'new_account_created',
      title: 'New member account created',
      message: newUserEmail
        ? `${newUserEmail} has created a new account.`
        : `A new member (${newUserAddress.slice(0, 6)}...${newUserAddress.slice(-4)}) has created an account.`,
      context_type: 'governance',
      context_id: execPod.id,
      context_url: `/profile/${newUserAddress}`,
      priority: 'low',
    }));

    // Insert all notifications
    const { data, error } = await supabase
      .from('general_notifications')
      .insert(notifications)
      .select();

    if (error) {
      console.error('❌ Error creating new account notifications:', error);
    } else {
      console.log(`✅ Created ${data?.length || 0} notifications for exec pod members`);
    }
  } catch (error) {
    console.error('❌ Error in notifyExecPodOfNewAccount:', error);
  }
}
