import { GelatoRelay } from '@gelatonetwork/relay-sdk';
import { ethers } from "ethers";
import { supabase } from "src/utils/supabaseClient";

const UNLOCK_CONTRACT = process.env.NEXT_PUBLIC_UNLOCK_CONTRACT!;
const SAFE_WALLET = process.env.NEXT_PUBLIC_SAFE_WALLET!;
const GELATO_API_KEY = process.env.GELATO_API_KEY!;

// Initialize Gelato Relay
const relay = new GelatoRelay();

// Unlock contract interface
const unlockInterface = new ethers.Interface([
  "function purchaseKey(address) external payable"
]);

// const relayManager = GelatoRelayManager.getInstance();

export async function airdropMembership(walletAddress: string) {
  try {
    console.log(`🔹 Preparing membership airdrop to ${walletAddress}...`);

    // Encode the contract call
    const unlockInterface = new ethers.Interface([
      "function purchaseKey(address) external payable"
    ]);
    
    const data = unlockInterface.encodeFunctionData("purchaseKey", [walletAddress]);

    // Submit via Gelato Relay with status tracking
    const response = await relayManager.sponsoredCall(
      UNLOCK_CONTRACT,
      data,
      async (status: TaskState) => {
        await updateTaskStatus(response.taskId, status, walletAddress);
      }
    );

    // Store initial task information
    await supabase.from("relay_tasks").insert({
      wallet_address: walletAddress,
      task_id: response.taskId,
      status: TaskState.WaitingForConfirmation
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
  status: TaskState, 
  walletAddress: string
) {
  try {
    const taskDetails = await relayManager.getTaskStatus(taskId);
    
    await supabase.from("relay_tasks").update({
      status: status,
      transaction_hash: taskDetails.task?.transactionHash || null,
      updated_at: new Date().toISOString()
    }).eq('task_id', taskId);

    if (status === TaskState.ExecSuccess) {
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
    const status = await relay.getTaskStatus(taskId);
    
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