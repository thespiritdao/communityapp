import { GelatoRelay } from '@gelatonetwork/relay-sdk';
import { ethers } from "ethers";
import { supabase } from "@/utils/supabaseClient";
import { GelatoRelayManager } from '@/app/api/utils/gelatoSetup';

// Task states enum
enum TaskState {
  WaitingForConfirmation = 'WaitingForConfirmation',
  ExecSuccess = 'ExecSuccess',
  ExecReverted = 'ExecReverted',
  Cancelled = 'Cancelled'
}

const UNLOCK_CONTRACT = process.env.NEXT_PUBLIC_UNLOCK_CONTRACT!;
const SAFE_WALLET = process.env.NEXT_PUBLIC_SAFE_WALLET!;
const GELATO_API_KEY = process.env.GELATO_API_KEY!;

// Initialize Gelato Relay
const relay = new GelatoRelay();
const relayManager = new GelatoRelayManager();

// Unlock contract interface
const unlockInterface = new ethers.Interface([
  "function purchaseKey(address) external payable"
]);

export async function airdropMembership(walletAddress: string) {
  try {
    console.log(`🔹 Preparing membership airdrop to ${walletAddress}...`);

    // Submit via Gelato Relay
    const response = await relayManager.grantMembership(walletAddress);

    // Store initial task information
    await supabase.from("relay_tasks").insert({
      wallet_address: walletAddress,
      task_id: response.taskId,
      status: 'pending'
    });

    return { 
      success: true, 
      taskId: response.taskId 
    };

  } catch (error) {
    console.error("❌ Airdrop failed:", error);
    return { success: false, error };
  }
}

async function updateTaskStatus(
  taskId: string, 
  walletAddress: string
) {
  try {
    const taskDetails = await relayManager.checkRelayStatus(taskId);
    
    await supabase.from("relay_tasks").update({
      status: taskDetails.task?.taskState || 'pending',
      transaction_hash: taskDetails.task?.transactionHash || null,
      updated_at: new Date().toISOString()
    }).eq('task_id', taskId);

    if (taskDetails.task?.taskState === 'ExecSuccess') {
      await supabase.from("user_profiles").update({
        membership_status: true
      }).eq('wallet_address', walletAddress);
    }

  } catch (error) {
    console.error("❌ Error updating task status:", error);
  }
}

export async function checkAirdropStatus(taskId: string) {
  try {
    const status = await relayManager.checkRelayStatus(taskId);
    
    // Update status in database if transaction is completed
    if (status.task?.taskState === 'ExecSuccess') {
      await supabase
        .from("relay_tasks")
        .update({
          status: 'completed',
          transaction_hash: status.task.transactionHash
        })
        .eq('task_id', taskId);
    }

    return status;
  } catch (error) {
    console.error("❌ Error checking relay status:", error);
    throw error;
  }
}

// Helper function to monitor task status
export async function monitorAirdropTask(taskId: string, maxAttempts = 30) {
  let attempts = 0;
  
  const checkStatus = async (): Promise<string | null> => {
    if (attempts >= maxAttempts) return null;
    
    const status = await checkAirdropStatus(taskId);
    
    if (status.task?.taskState === 'ExecSuccess') {
      return status.task.transactionHash;
    } else if (status.task?.taskState === 'ExecReverted') {
      throw new Error('Transaction reverted');
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    return checkStatus();
  };

  return checkStatus();
}