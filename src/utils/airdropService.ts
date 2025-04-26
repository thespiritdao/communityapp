// utils/airdropService.ts

import { GelatoRelayManager } from './gelatoSetup';
import { supabase } from './supabaseClient';

export class AirdropService {
  private gelato: GelatoRelayManager;

  constructor() {
    this.gelato = new GelatoRelayManager();
  }

  async processMembershipAirdrop(recipientAddress: string) {
    try {
      // 1. Check if user already has membership
      const { data: existingMembership } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('wallet_address', recipientAddress)
        .single();

      if (existingMembership) {
        return { status: 'exists', message: 'User already has membership' };
      }

      // 2. Submit relay request
      const relayResponse = await this.gelato.grantMembership(recipientAddress);

      // 3. Store the task information
      await supabase.from('airdrop_tasks').insert({
        wallet_address: recipientAddress,
        task_id: relayResponse.taskId,
        status: 'pending'
      });

      return {
        status: 'submitted',
        taskId: relayResponse.taskId,
        message: 'Airdrop relay request submitted'
      };
    } catch (error) {
      console.error('Airdrop processing error:', error);
      throw error;
    }
  }

  async checkAirdropStatus(taskId: string) {
    const status = await this.gelato.checkRelayStatus(taskId);
    
    if (status.task?.taskState === 'ExecSuccess') {
      // Update database with success status
      await supabase.from('airdrop_tasks').update({
        status: 'completed',
        transaction_hash: status.task.transactionHash
      }).eq('task_id', taskId);
    }

    return status;
  }
}