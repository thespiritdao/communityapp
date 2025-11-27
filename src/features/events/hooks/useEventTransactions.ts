import React, { useCallback } from 'react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import EventSystemFactoryABI from '@/abis/EventSystemFactory.json';
import EventEscrowABI from '@/abis/EventEscrowABI.json';
import EventRegistrationNFTFactoryABI from '@/abis/EventRegistrationFactoryABI.json';
import EventCompletionNFTFactoryABI from '@/abis/EventCompletionNFTFactoryABI.json';
import { CONTRACT_ADDRESSES, CHAIN_CONFIG } from '@/config/contracts';

// Use the same chain ID constant as Cart.tsx
const BASE_CHAIN_ID = CHAIN_CONFIG.CHAIN_ID;

const EVENT_SYSTEM_FACTORY = CONTRACT_ADDRESSES.EVENT_SYSTEM_FACTORY;
const EVENT_ESCROW_CONTRACT = CONTRACT_ADDRESSES.EVENT_ESCROW;
const EVENT_REGISTRATION_FACTORY = CONTRACT_ADDRESSES.EVENT_REGISTRATION_FACTORY;
const EVENT_COMPLETION_FACTORY = CONTRACT_ADDRESSES.EVENT_COMPLETION_FACTORY;

export interface CreateEventParams {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  fundRecipient: string; // Pod address
  priceSystem: string;   // In tokens (will be converted to wei)
  priceSelf: string;     // In tokens (will be converted to wei)
}

export interface RegisterForEventParams {
  escrowAddress: string;
  eventId: string;
}

export interface MintRegistrationParams {
  eventId: string;
  recipientAddress: string;
  tokenURI: string;
}

export interface MintCompletionParams {
  eventId: string;
  recipients: string[];
  tokenURIs: string[];
  metadataArray: string[];
}

export function useEventTransactions() {
  const { address } = useAccount();

  // Validate environment variables on hook initialization
  React.useEffect(() => {
    console.log('🔍 Event Contract Configuration:', {
      EVENT_SYSTEM_FACTORY,
      EVENT_ESCROW_CONTRACT,
      EVENT_REGISTRATION_FACTORY,
      EVENT_COMPLETION_FACTORY,
      hasEventSystemFactory: Boolean(EVENT_SYSTEM_FACTORY),
      hasEventEscrow: Boolean(EVENT_ESCROW_CONTRACT),
      hasRegistrationFactory: Boolean(EVENT_REGISTRATION_FACTORY),
      hasCompletionFactory: Boolean(EVENT_COMPLETION_FACTORY)
    });

    console.log('🔍 Environment Variables Check:', {
      SYSTEM_FACTORY: process.env.NEXT_PUBLIC_EVENT_SYSTEM_FACTORY,
      ESCROW: process.env.NEXT_PUBLIC_EVENT_ESCROW_CONTRACT,
      REG_FACTORY: process.env.NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY,
      COMP_FACTORY: process.env.NEXT_PUBLIC_EVENT_COMPLETION_FACTORY
    });

    if (!EVENT_SYSTEM_FACTORY) {
      console.error('❌ NEXT_PUBLIC_EVENT_SYSTEM_FACTORY environment variable not set');
    }
    if (!EVENT_ESCROW_CONTRACT) {
      console.error('❌ NEXT_PUBLIC_EVENT_ESCROW_CONTRACT environment variable not set');
    }
    if (!EVENT_REGISTRATION_FACTORY) {
      console.error('❌ NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY environment variable not set');
    }
    if (!EVENT_COMPLETION_FACTORY) {
      console.error('❌ NEXT_PUBLIC_EVENT_COMPLETION_FACTORY environment variable not set');
    }
  }, []);

  // Create complete event system (factory call)
  const getCreateEventSystemCall = useCallback((params: CreateEventParams) => {
    if (!address) throw new Error('Wallet not connected');

    // Validate required parameters
    if (!params.eventId || typeof params.eventId !== 'string') {
      throw new Error('Event ID is required and must be a string');
    }
    if (!params.eventTitle || typeof params.eventTitle !== 'string') {
      throw new Error('Event title is required and must be a string');
    }
    if (!params.eventDate || !(params.eventDate instanceof Date)) {
      throw new Error('Event date is required and must be a Date object');
    }
    if (!params.fundRecipient || typeof params.fundRecipient !== 'string' || !params.fundRecipient.startsWith('0x')) {
      throw new Error('Fund recipient is required and must be a valid address');
    }

    // Timestamp validation - warn if in past but don't force change
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds
    const eventTimestamp = Math.floor(params.eventDate.getTime() / 1000);

    // Only warn if timestamp is in past, don't force change
    if (eventTimestamp < now) {
      console.warn('⚠️ Event date is in the past, ensure this is intentional');
    }

    const systemAmount = parseUnits(params.priceSystem || '0', 18);
    const selfAmount = parseUnits(params.priceSelf || '0', 18);

    console.log('🔍 getCreateEventSystemCall Debug:', {
      originalDate: params.eventDate,
      eventTimestamp,
      currentTimestamp: now,
      isInPast: eventTimestamp < now,
      timeDiff: eventTimestamp - now,
      systemAmount: systemAmount.toString(),
      selfAmount: selfAmount.toString(),
      priceSystemString: params.priceSystem,
      priceSelfString: params.priceSelf,
      eventId: params.eventId,
      eventTitle: params.eventTitle,
      fundRecipient: params.fundRecipient,
      eventOrganizer: address
    });

    return [{
      address: EVENT_SYSTEM_FACTORY as `0x${string}`,
      abi: EventSystemFactoryABI,
      functionName: 'createCompleteEventSystem',
      args: [
        params.eventId,                            // string
        params.eventTitle,                         // string
        eventTimestamp,                            // uint256 (Unix timestamp in seconds) - using actual timestamp now
        address as `0x${string}`,                  // address (eventOrganizer)
        params.fundRecipient as `0x${string}`,    // address
        systemAmount,                              // uint256 (wei)
        selfAmount                                 // uint256 (wei)
      ]
    }];
  }, [address]);

  // Create free event system (factory call)
  const getCreateFreeEventCall = useCallback((
    eventId: string,
    eventTitle: string,
    eventDate: Date,
    fundRecipient: string
  ) => {
    if (!address) throw new Error('Wallet not connected');

    // Validate required parameters
    if (!eventId || typeof eventId !== 'string') {
      throw new Error('Event ID is required and must be a string');
    }
    if (!eventTitle || typeof eventTitle !== 'string') {
      throw new Error('Event title is required and must be a string');
    }
    if (!eventDate || !(eventDate instanceof Date)) {
      throw new Error('Event date is required and must be a Date object');
    }
    if (!fundRecipient || typeof fundRecipient !== 'string' || !fundRecipient.startsWith('0x')) {
      throw new Error('Fund recipient is required and must be a valid address');
    }

    // Timestamp validation - warn if in past but don't force change
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds
    const eventTimestamp = Math.floor(eventDate.getTime() / 1000);

    // Only warn if timestamp is in past, don't force change
    if (eventTimestamp < now) {
      console.warn('⚠️ Event date is in the past, ensure this is intentional');
    }

    console.log('🔍 getCreateFreeEventCall Debug:', {
      originalDate: eventDate,
      eventTimestamp,
      currentTimestamp: now,
      isInPast: eventTimestamp < now,
      timeDiff: eventTimestamp - now,
      eventId,
      eventTitle,
      fundRecipient,
      eventOrganizer: address
    });

    return [{
      address: EVENT_SYSTEM_FACTORY as `0x${string}`,
      abi: EventSystemFactoryABI,
      functionName: 'createFreeEventSystem',
      args: [
        eventId,                            // string
        eventTitle,                         // string
        eventTimestamp,                     // uint256 (Unix timestamp in seconds) - using actual timestamp now
        address as `0x${string}`,           // address (eventOrganizer)
        fundRecipient as `0x${string}`      // address
      ]
    }];
  }, [address]);

  // Register for event (pay for event)
  const getRegisterForEventCall = useCallback((params: RegisterForEventParams) => {
    // Validate required parameters
    if (!params.eventId || typeof params.eventId !== 'string') {
      throw new Error('Event ID is required and must be a string');
    }
    
    const escrowAddress = params.escrowAddress || EVENT_ESCROW_CONTRACT;
    if (!escrowAddress || !escrowAddress.startsWith('0x')) {
      throw new Error('Valid escrow contract address is required');
    }

    return [{
      address: escrowAddress as `0x${string}`,
      abi: EventEscrowABI,
      functionName: 'payForEvent',
      args: [params.eventId]
    }];
  }, []);

  // Mint registration NFT through factory (organizer only)
  const getMintRegistrationCall = useCallback((params: MintRegistrationParams) => {
    return [{
      address: EVENT_REGISTRATION_FACTORY,
      abi: EventRegistrationNFTFactoryABI,
      functionName: 'mintRegistrationTokenForEvent',
      args: [
        params.eventId,
        params.recipientAddress as `0x${string}`,
        params.tokenURI
      ]
    }];
  }, []);

  // Batch mint completion NFTs through factory (organizer only)
  const getBatchMintCompletionCall = useCallback((params: MintCompletionParams) => {
    return [{
      address: EVENT_COMPLETION_FACTORY,
      abi: EventCompletionNFTFactoryABI,
      functionName: 'batchMintCompletionTokensForEvent',
      args: [
        params.eventId,
        params.recipients as `0x${string}`[],
        params.tokenURIs,
        params.metadataArray
      ]
    }];
  }, []);

  // Complete event and distribute funds (organizer only)
  const getCompleteEventCall = useCallback((eventId: string) => {
    return [{
      address: EVENT_ESCROW_CONTRACT,
      abi: EventEscrowABI,
      functionName: 'completeEvent',
      args: [eventId]
    }];
  }, []);

  // Cancel event (organizer only)
  const getCancelEventCall = useCallback((eventId: string) => {
    return [{
      address: EVENT_ESCROW_CONTRACT,
      abi: EventEscrowABI,
      functionName: 'cancelEvent',
      args: [eventId]
    }];
  }, []);

  // Get transaction configuration for sponsored transactions  
  const getTransactionConfig = useCallback(() => ({
    chainId: BASE_CHAIN_ID,
    isSponsored: true
  }), []);

  return {
    // Call generators
    getCreateEventSystemCall,
    getCreateFreeEventCall,
    getRegisterForEventCall,
    getMintRegistrationCall,
    getBatchMintCompletionCall,
    getCompleteEventCall,
    getCancelEventCall,
    
    // Config
    getTransactionConfig,
    
    // Utils
    isConnected: !!address,
    userAddress: address
  };
}