import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  parseEther,
  encodeFunctionData,
} from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import EventManagerABI from '../../../abis/EventManager.json';

// Contract configuration
const EVENT_MANAGER_CONTRACT_ADDRESS = CONTRACT_ADDRESSES.EVENT_MANAGER;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

export class EventManagerService {
  private static publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  /**
   * Create an event on the blockchain
   */
  static async createEvent(
    eventId: string,
    title: string,
    eventDate: Date,
    fundRecipient: Address,
    priceSystem = '0',
    priceSelf = '0',
    maxAttendees = 0,
  ): Promise<string> {
    try {
      if (!EVENT_MANAGER_CONTRACT_ADDRESS) {
        throw new Error('EVENT_MANAGER_CONTRACT_ADDRESS not configured');
      }

      const eventTimestamp = Math.floor(eventDate.getTime() / 1000);
      const priceSystemWei = parseEther(priceSystem);
      const priceSelfWei = parseEther(priceSelf);

      console.log('🔗 Creating event on blockchain:', {
        eventId,
        title,
        eventTimestamp,
        fundRecipient,
        priceSystemWei: priceSystemWei.toString(),
        priceSelfWei: priceSelfWei.toString(),
        maxAttendees,
        contractAddress: EVENT_MANAGER_CONTRACT_ADDRESS,
      });

      // Return the transaction data for OnChainKit to execute
      return encodeFunctionData({
        abi: EventManagerABI,
        functionName: 'createEvent',
        args: [
          eventId,
          title,
          BigInt(eventTimestamp),
          fundRecipient,
          priceSystemWei,
          priceSelfWei,
          BigInt(maxAttendees),
        ],
      });
    } catch (error) {
      console.error('❌ Error creating event on blockchain:', error);
      throw error;
    }
  }

  /**
   * Prepare event creation transaction calls for OnchainKit Transaction component
   */
  static prepareCreateEventCalls(
    eventId: string,
    title: string,
    eventDate: Date,
    fundRecipient: Address,
    priceSystem = '0',
    priceSelf = '0',
    maxAttendees: number | undefined = 0,
  ): any[] {
    try {
      if (!EVENT_MANAGER_CONTRACT_ADDRESS) {
        throw new Error('EVENT_MANAGER_CONTRACT_ADDRESS not configured');
      }

      const eventTimestamp = Math.floor(eventDate.getTime() / 1000);
      const priceSystemWei = parseEther(priceSystem);
      const priceSelfWei = parseEther(priceSelf);
      const maxAttendeesValue = maxAttendees || 0; // Convert undefined/null to 0 for unlimited

      console.log('🔗 Preparing create event call:', {
        eventId,
        title,
        eventTimestamp,
        fundRecipient,
        priceSystemWei: priceSystemWei.toString(),
        priceSelfWei: priceSelfWei.toString(),
        maxAttendees: maxAttendeesValue,
        contractAddress: EVENT_MANAGER_CONTRACT_ADDRESS,
      });

      return [
        {
          to: EVENT_MANAGER_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: EventManagerABI,
            functionName: 'createEvent',
            args: [
              eventId,
              title,
              BigInt(eventTimestamp),
              fundRecipient,
              priceSystemWei,
              priceSelfWei,
              BigInt(maxAttendeesValue),
            ],
          }),
        },
      ];
    } catch (error) {
      console.error('❌ Error preparing create event calls:', error);
      throw error;
    }
  }

  /**
   * Prepare event completion transaction calls for OnchainKit Transaction component
   */
  static prepareCompleteEventCalls(eventId: string): any[] {
    try {
      if (!EVENT_MANAGER_CONTRACT_ADDRESS) {
        throw new Error('EVENT_MANAGER_CONTRACT_ADDRESS not configured');
      }

      console.log('✅ Preparing complete event call for:', {
        eventId,
        contractAddress: EVENT_MANAGER_CONTRACT_ADDRESS,
      });

      return [
        {
          to: EVENT_MANAGER_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: EventManagerABI,
            functionName: 'completeEvent',
            args: [eventId],
          }),
        },
      ];
    } catch (error) {
      console.error('❌ Error preparing complete event calls:', error);
      throw error;
    }
  }

  /**
   * Mint completion certificate NFT for a single attendee
   */
  static async mintCompletionCertificate(
    eventId: string,
    recipientAddress: Address,
    metadataURI: string,
    signer: any, // wallet signer
  ): Promise<string> {
    try {
      const walletClient = createWalletClient({
        chain: base,
        transport: http(RPC_URL),
        account: signer.account,
      });

      console.log('🎨 Minting NFT for:', {
        eventId,
        recipientAddress,
        metadataURI,
      });

      const txHash = await walletClient.writeContract({
        address: EVENT_MANAGER_CONTRACT_ADDRESS,
        abi: EventManagerABI,
        functionName: 'mintCompletionCertificate',
        args: [eventId, recipientAddress, metadataURI],
        account: signer.account,
      });

      console.log('✅ NFT mint transaction sent:', txHash);
      return txHash;
    } catch (error) {
      console.error('❌ Error minting completion certificate:', error);
      throw error;
    }
  }

  /**
   * Prepare batch mint transaction calls for OnchainKit Transaction component
   */
  static prepareBatchMintCalls(
    eventId: string,
    recipients: Address[],
    metadataURIs: string[],
  ): any[] {
    if (recipients.length !== metadataURIs.length) {
      throw new Error('Recipients and metadata arrays must have same length');
    }

    if (!EVENT_MANAGER_CONTRACT_ADDRESS) {
      throw new Error(
        'EVENT_MANAGER_CONTRACT_ADDRESS not configured. Please set NEXT_PUBLIC_EVENT_MANAGER or NEXT_PUBLIC_EVENT_MANAGER environment variable.',
      );
    }

    console.log('🎨 Preparing batch mint calls for:', {
      eventId,
      count: recipients.length,
      recipients: recipients.slice(0, 3), // Log first 3 for debugging
      contractAddress: EVENT_MANAGER_CONTRACT_ADDRESS,
    });

    return [
      {
        to: EVENT_MANAGER_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: EventManagerABI,
          functionName: 'batchMintCertificates',
          args: [eventId, recipients, metadataURIs],
        }),
      },
    ];
  }

  /**
   * Generate dynamic NFT metadata for event completion certificate
   */
  static generateCertificateMetadata(
    event: any,
    _recipientAddress: string,
    _userName?: string,
  ): any {
    const completionDate = new Date(event.event_end_date || event.event_date);
    const eventDate = new Date(event.event_date);

    return {
      name: `${event.title} - Completion Certificate`,
      description: `Completion certificate for "${event.title}" event. This NFT certifies attendance and participation in the community event.`,
      image:
        event.event_image_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(event.title)}&size=400&background=bfe7c6&color=000`,
      attributes: [
        {
          trait_type: 'Event Title',
          value: event.title,
        },
        {
          trait_type: 'Event Date',
          value: eventDate.toISOString().split('T')[0],
        },
        {
          trait_type: 'Completion Date',
          value: completionDate.toISOString().split('T')[0],
        },
        // No recipient name or event location: this metadata is written
        // on-chain as a data URI, permanently and publicly. The holder's
        // wallet already identifies the recipient. (Privacy review 2026-10.)
        {
          trait_type: 'Organization',
          value: 'Community DAO',
        },
        {
          trait_type: 'Certificate Type',
          value: 'Event Completion',
        },
      ],
      external_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/events/${event.id}`,
      background_color: 'bfe7c6',
    };
  }

  /**
   * Create metadata URI (in production, upload to IPFS)
   */
  static async createMetadataURI(metadata: any): Promise<string> {
    // For now, create a data URI - in production, upload to IPFS
    const metadataJson = JSON.stringify(metadata, null, 2);
    return `data:application/json;base64,${btoa(metadataJson)}`;
  }

  /**
   * Batch mint completion certificates for multiple attendees (DEPRECATED - use prepareBatchMintCalls with Transaction component)
   */
  static async batchMintCertificates(
    eventId: string,
    recipients: Address[],
    metadataURIs: string[],
    signer: any,
  ): Promise<string> {
    console.warn(
      '⚠️ batchMintCertificates is deprecated. Use prepareBatchMintCalls with OnchainKit Transaction component instead.',
    );

    try {
      if (recipients.length !== metadataURIs.length) {
        throw new Error('Recipients and metadata arrays must have same length');
      }

      const walletClient = createWalletClient({
        chain: base,
        transport: http(RPC_URL),
        account: signer.account,
      });

      console.log('🎨 Batch minting NFTs for:', {
        eventId,
        count: recipients.length,
        recipients: recipients.slice(0, 3), // Log first 3 for debugging
      });

      const txHash = await walletClient.writeContract({
        address: EVENT_MANAGER_CONTRACT_ADDRESS,
        abi: EventManagerABI,
        functionName: 'batchMintCertificates',
        args: [eventId, recipients, metadataURIs],
        account: signer.account,
      });

      console.log('✅ Batch NFT mint transaction sent:', txHash);
      return txHash;
    } catch (error) {
      console.error('❌ Error batch minting certificates:', error);
      throw error;
    }
  }

  /**
   * Complete an event on the smart contract
   */
  static async completeEventOnChain(
    eventId: string,
    signer: any,
  ): Promise<string> {
    try {
      const walletClient = createWalletClient({
        chain: base,
        transport: http(RPC_URL),
        account: signer.account,
      });

      console.log('🎯 Completing event on-chain:', eventId);

      const txHash = await walletClient.writeContract({
        address: EVENT_MANAGER_CONTRACT_ADDRESS,
        abi: EventManagerABI,
        functionName: 'completeEvent',
        args: [eventId],
        account: signer.account,
      });

      console.log('✅ Event completion transaction sent:', txHash);
      return txHash;
    } catch (error) {
      console.error('❌ Error completing event on-chain:', error);
      throw error;
    }
  }


  /**
   * Check if event exists on chain
   */
  static async getEventOnChain(eventId: string): Promise<any> {
    try {
      const result = await this.publicClient.readContract({
        address: EVENT_MANAGER_CONTRACT_ADDRESS,
        abi: EventManagerABI,
        functionName: 'getEvent',
        args: [eventId],
      });

      return result;
    } catch (error) {
      console.log(
        'Event not found on chain or contract not deployed:',
        eventId,
      );
      return null;
    }
  }

  /**
   * Check if user is registered for event on chain
   */
  static async isRegisteredOnChain(
    eventId: string,
    userAddress: Address,
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: EVENT_MANAGER_CONTRACT_ADDRESS,
        abi: EventManagerABI,
        functionName: 'isRegisteredForEvent',
        args: [eventId, userAddress],
      });

      return result as boolean;
    } catch (error) {
      console.log('Error checking registration on chain:', error);
      return false;
    }
  }
}
