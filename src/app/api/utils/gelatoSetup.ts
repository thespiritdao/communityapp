//  utils/gelatoSetup.ts

import {
  GelatoRelay,
  RelayResponse,
  SponsoredCallRequest
} from '@gelatonetwork/relay-sdk';
import { Contract, ethers } from 'ethers';
import { UNLOCK_PUBLIC_LOCK_ABI } from './contractABI';

// Environment variables needed
const GELATO_API_KEY = process.env.GELATO_API_KEY!;
const UNLOCK_CONTRACT_ADDRESS = "0x756d2ad6642c2Ed43fd87Af70D83F277Ec0a669f";
const SAFE_ADDRESS = process.env.SAFE_ADDRESS!;

export class GelatoRelayManager {
  private relay: GelatoRelay;
  private contract: Contract;

  constructor() {
    this.relay = new GelatoRelay();
    
    // Initialize contract interface
    this.contract = new Contract(
      UNLOCK_CONTRACT_ADDRESS,
      UNLOCK_PUBLIC_LOCK_ABI
    );
  }

  async grantMembership(recipientAddress: string): Promise<RelayResponse> {
    // Encode the contract interaction
    const data = this.contract.interface.encodeFunctionData("grantKeys", [
      recipientAddress
    ]);

    // Prepare the sponsored call request
    const request: SponsoredCallRequest = {
      chainId: 8453, // Base Mainnet
      target: UNLOCK_CONTRACT_ADDRESS,
      data: data,
      user: SAFE_ADDRESS, // Your Safe wallet address
    };

    try {
      // Submit the relay request
      const relayResponse = await this.relay.sponsoredCall(
        request,
        GELATO_API_KEY
      );

      console.log("Relay Response:", relayResponse);
      return relayResponse;
    } catch (error) {
      console.error("Gelato Relay Error:", error);
      throw error;
    }
  }

  async checkRelayStatus(taskId: string) {
    try {
      const status = await this.relay.getTaskStatus(taskId);
      return status;
    } catch (error) {
      console.error("Error checking relay status:", error);
      throw error;
    }
  }
}