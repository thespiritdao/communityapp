//src/utils/safe.ts 

import { ethers } from "ethers";
import Safe from "@safe-global/protocol-kit";
import { EthersAdapter } from "@safe-global/protocol-kit"; 

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_WALLET!;
const SAFE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

export async function sendSafeTransaction(to: string, amount: string) {
  try {
    console.log(`🔹 Sending transaction from SAFE: ${SAFE_ADDRESS} to ${to}`);

    const provider = new ethers.JsonRpcProvider(SAFE_RPC_URL);
    const signer = new ethers.Wallet(process.env.SAFE_PRIVATE_KEY as string, provider); // ✅ Fix signer
    const ethAdapter = new EthersAdapter({ signerOrProvider: signer });

    const safeSdk = await Safe.create({ ethAdapter, safeAddress: SAFE_ADDRESS });

    const transaction = {
      to,
      value: ethers.parseUnits(amount, "ether").toString(),
      data: "0x",
    };

    const safeTransaction = await safeSdk.createTransaction({ transactions: [transaction] });

    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
    console.log(`🔄 Transaction Proposed: ${safeTxHash}`);

    await safeSdk.signTransaction(safeTransaction);

    return { success: true, safeTxHash };
  } catch (error) {
    console.error("❌ Safe Transaction Failed:", error);
    return { success: false, error };
  }
}
