//src/utils/safeTransaction.ts

import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import axios from 'axios';

const SAFE_ADDRESS = process.env.SAFE_ADDRESS!;
const SAFE_API_URL = process.env.SAFE_API_URL!;
const UNLOCK_CONTRACT = process.env.UNLOCK_CONTRACT!;

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

export async function sendSafeTransaction(to: string, amount: string) {
  try {
    console.log(`🔹 Creating Safe transaction to ${to} for ${amount} wei`);

    const safeService = new SafeApiKit({ txServiceUrl: SAFE_API_URL, ethAdapter: provider });

    const safeTransactionData = {
      to,
      value: amount,
      data: '0x', // Empty data for sending ETH
    };

    // Submit transaction
    const response = await axios.post(`${SAFE_API_URL}/api/v1/safes/${SAFE_ADDRESS}/multisig-transactions/`, {
      ...safeTransactionData,
      safe: SAFE_ADDRESS,
      operation: 0, // CALL operation
    });

    console.log('✅ Safe transaction created:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Safe Transaction Error:', error);
    return null;
  }
}
