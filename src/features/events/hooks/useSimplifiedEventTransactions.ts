import { useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

// Import the simplified contract ABI
const EventManagerABI = require('src/abis/EventManager.json');

// Use the same chain ID constant
const BASE_CHAIN_ID = 8453;

// Contract addresses from centralized config
const EVENT_MANAGER_CONTRACT = CONTRACT_ADDRESSES.EVENT_MANAGER;
const SYSTEM_TOKEN = CONTRACT_ADDRESSES.SYSTEM_TOKEN;
const SELF_TOKEN = CONTRACT_ADDRESSES.SELF_TOKEN;

export interface CreateSimplifiedEventParams {
  eventId: string;
  title: string;
  eventDate: Date;
  fundRecipient: string;
  priceSystem: string; // In token units (will be converted to wei)
  priceSelf: string; // In token units (will be converted to wei)
  maxAttendees: number;
}

export interface RegisterEventParams {
  eventId: string;
}

export interface MintCertificateParams {
  eventId: string;
  recipient: string;
  metadataURI: string;
}

export function useSimplifiedEventTransactions() {
  const { evmAddress: address } = useEvmAddress();

  // Create event call
  const getCreateEventCall = useCallback(
    (params: CreateSimplifiedEventParams) => {
      if (!address) throw new Error('Wallet not connected');
      if (!EVENT_MANAGER_CONTRACT)
        throw new Error('Event manager contract not configured');

      // Validate parameters
      if (
        !params.eventId ||
        !params.title ||
        !params.eventDate ||
        !params.fundRecipient
      ) {
        throw new Error('Missing required parameters');
      }

      // Ensure event date is in the future with buffer
      const now = Math.floor(Date.now() / 1000);
      const eventTimestamp = Math.floor(params.eventDate.getTime() / 1000);
      const finalTimestamp = Math.max(eventTimestamp, now + 300); // 5 minute buffer

      // Convert prices to token units (18 decimals for both SYSTEM and SELF)
      const priceSystemWei = parseUnits(params.priceSystem || '0', 18);
      const priceSelfWei = parseUnits(params.priceSelf || '0', 18);

      console.log('🔍 Event Creation Transaction Data:', {
        contractAddress: EVENT_MANAGER_CONTRACT,
        functionName: 'createEvent',
        eventId: params.eventId,
        title: params.title,
        eventDate: params.eventDate,
        finalTimestamp,
        fundRecipient: params.fundRecipient,
        priceSystemWei: priceSystemWei.toString(),
        priceSelfWei: priceSelfWei.toString(),
        maxAttendees: params.maxAttendees,
        organizer: address,
        note: 'This should create the event on-chain',
      });

      return [
        {
          address: EVENT_MANAGER_CONTRACT,
          abi: EventManagerABI,
          functionName: 'createEvent',
          args: [
            params.eventId, // string eventId
            params.title, // string title
            finalTimestamp, // uint256 eventDate
            params.fundRecipient as `0x${string}`, // address fundRecipient
            priceSystemWei, // uint256 priceSystem
            priceSelfWei, // uint256 priceSelf
            params.maxAttendees || 0, // uint256 maxAttendees (0 = unlimited)
          ],
        },
      ];
    },
    [address],
  );

  // Register for event call (ERC20 tokens handled by allowance/transferFrom)
  const getRegisterEventCall = useCallback(
    (params: RegisterEventParams) => {
      if (!EVENT_MANAGER_CONTRACT)
        throw new Error('Event manager contract not configured');

      console.log('🔍 Event Registration Transaction Data:', {
        contractAddress: EVENT_MANAGER_CONTRACT,
        functionName: 'registerForEvent',
        eventId: params.eventId,
        attendee: address,
        note: 'Will fail if event does not exist on-chain (Event not found error)',
        tokenPayments: 'Handled via separate allowance/transferFrom calls',
      });

      return [
        {
          address: EVENT_MANAGER_CONTRACT,
          abi: EventManagerABI,
          functionName: 'registerForEvent',
          args: [params.eventId],
          // No value field - ERC20 tokens handled via allowance
        },
      ];
    },
    [address],
  );

  // Complete event call
  const getCompleteEventCall = useCallback((eventId: string) => {
    if (!EVENT_MANAGER_CONTRACT)
      throw new Error('Event manager contract not configured');

    return [
      {
        address: EVENT_MANAGER_CONTRACT,
        abi: EventManagerABI,
        functionName: 'completeEvent',
        args: [eventId],
      },
    ];
  }, []);

  // Cancel event call
  const getCancelEventCall = useCallback((eventId: string) => {
    if (!EVENT_MANAGER_CONTRACT)
      throw new Error('Event manager contract not configured');

    return [
      {
        address: EVENT_MANAGER_CONTRACT,
        abi: EventManagerABI,
        functionName: 'cancelEvent',
        args: [eventId],
      },
    ];
  }, []);

  // Mint completion certificate call
  const getMintCertificateCall = useCallback(
    (params: MintCertificateParams) => {
      if (!EVENT_MANAGER_CONTRACT)
        throw new Error('Event manager contract not configured');

      return [
        {
          address: EVENT_MANAGER_CONTRACT,
          abi: EventManagerABI,
          functionName: 'mintCompletionCertificate',
          args: [
            params.eventId,
            params.recipient as `0x${string}`,
            params.metadataURI,
          ],
        },
      ];
    },
    [],
  );

  // Batch mint certificates call
  const getBatchMintCertificatesCall = useCallback(
    (eventId: string, recipients: string[], metadataURIs: string[]) => {
      if (!EVENT_MANAGER_CONTRACT)
        throw new Error('Event manager contract not configured');

      return [
        {
          address: EVENT_MANAGER_CONTRACT,
          abi: EventManagerABI,
          functionName: 'batchMintCertificates',
          args: [eventId, recipients as `0x${string}`[], metadataURIs],
        },
      ];
    },
    [],
  );

  // Get transaction configuration
  const getTransactionConfig = useCallback(
    () => ({
      chainId: BASE_CHAIN_ID,
      isSponsored: true,
    }),
    [],
  );

  return {
    // Call generators
    getCreateEventCall,
    getRegisterEventCall,
    getCompleteEventCall,
    getCancelEventCall,
    getMintCertificateCall,
    getBatchMintCertificatesCall,

    // Config
    getTransactionConfig,

    // Contract info
    contractAddress: EVENT_MANAGER_CONTRACT,

    // Utils
    isConnected: !!address,
    userAddress: address,
  };
}
