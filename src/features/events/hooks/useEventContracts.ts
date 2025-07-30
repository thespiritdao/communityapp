import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseAbi, encodeFunctionData, parseUnits } from 'viem';
import EventRegistrationNFTABI from '@/abis/EventRegistrationNFTABI.json';
import EventCompletionNFTABI from '@/abis/EventCompletionNFTABI.json';
import EventEscrowABI from '@/abis/EventEscrowABI.json';
import { Event, EventRegistration } from '../types/event';

// Contract addresses
const EVENT_ESCROW_CONTRACT = process.env.NEXT_PUBLIC_EVENT_ESCROW_CONTRACT as `0x${string}`;
const EVENT_REGISTRATION_FACTORY = process.env.NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY as `0x${string}`;
const EVENT_COMPLETION_FACTORY = process.env.NEXT_PUBLIC_EVENT_COMPLETION_FACTORY as `0x${string}`;

export function useEventContracts() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deploy registration NFT contract through factory
  const deployRegistrationContract = useCallback(async (
    eventId: string,
    eventTitle: string,
    eventDate: Date
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Deploying registration contract via factory:', { eventId, eventTitle });
      
      const eventTimestamp = Math.floor(eventDate.getTime() / 1000);
      
      const tx = await walletClient.writeContract({
        address: EVENT_REGISTRATION_FACTORY,
        abi: EventRegistrationNFTFactoryABI,
        functionName: 'createEventRegistrationSystem',
        args: [
          eventId,
          eventTitle,
          eventTimestamp,
          address as `0x${string}`
        ]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      // Extract contract address from logs
      const contractAddress = receipt.logs?.[0]?.address || null;
      console.log('Registration contract deployed successfully:', { txHash: tx, contractAddress });
      
      return contractAddress;
    } catch (err) {
      console.error('Failed to deploy registration contract:', err);
      setError(err instanceof Error ? err.message : 'Failed to deploy registration contract');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Deploy completion NFT contract through factory  
  const deployCompletionContract = useCallback(async (
    eventId: string,
    eventTitle: string,
    eventDate: Date
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Deploying completion contract via factory:', { eventId, eventTitle });
      
      const eventTimestamp = Math.floor(eventDate.getTime() / 1000);
      
      const tx = await walletClient.writeContract({
        address: EVENT_COMPLETION_FACTORY,
        abi: EventCompletionNFTFactoryABI,
        functionName: 'createEventCompletionSystem',
        args: [
          eventId,
          eventTitle,
          eventTimestamp,
          address as `0x${string}`,
          address as `0x${string}`, // fundRecipient - using deployer as default
          BigInt(0), // priceSystem
          BigInt(0)  // priceSelf
        ]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      // Extract contract address from logs
      const contractAddress = receipt.logs?.[0]?.address || null;
      console.log('Completion contract deployed successfully:', { txHash: tx, contractAddress });
      
      return contractAddress;
    } catch (err) {
      console.error('Failed to deploy completion contract:', err);
      setError(err instanceof Error ? err.message : 'Failed to deploy completion contract');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Mint registration NFT through factory
  const mintRegistrationNFT = useCallback(async (
    eventId: string,
    recipientAddress: string,
    tokenURI: string
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Minting registration NFT via factory:', { eventId, recipientAddress, tokenURI });
      
      const tx = await walletClient.writeContract({
        address: EVENT_REGISTRATION_FACTORY,
        abi: EventRegistrationNFTFactoryABI,
        functionName: 'mintRegistrationTokenForEvent',
        args: [eventId, recipientAddress as `0x${string}`, tokenURI]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Registration NFT minted successfully:', { txHash: tx, tokenId: receipt.logs?.[0] });
      return tx;
    } catch (err) {
      console.error('Failed to mint registration NFT:', err);
      setError(err instanceof Error ? err.message : 'Failed to mint registration NFT');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Mint completion NFT through factory
  const mintCompletionNFT = useCallback(async (
    eventId: string,
    recipientAddress: string
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Minting completion NFT via factory:', { eventId, recipientAddress });
      
      const tx = await walletClient.writeContract({
        address: EVENT_COMPLETION_FACTORY,
        abi: EventCompletionNFTFactoryABI,
        functionName: 'mintCompletionTokenForEvent',
        args: [eventId, recipientAddress as `0x${string}`]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Completion NFT minted successfully:', { txHash: tx, tokenId: receipt.logs?.[0] });
      return tx;
    } catch (err) {
      console.error('Failed to mint completion NFT:', err);
      setError(err instanceof Error ? err.message : 'Failed to mint completion NFT');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Batch mint completion NFTs for multiple users through factory
  const batchMintCompletionNFTs = useCallback(async (
    eventId: string,
    recipients: string[]
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Batch minting completion NFTs via factory:', { 
        eventId, 
        recipients: recipients.length
      });
      
      // Validate recipients array
      const validatedRecipients = recipients.map(addr => {
        if (!addr.startsWith('0x') || addr.length !== 42) {
          throw new Error(`Invalid address: ${addr}`);
        }
        return addr as `0x${string}`;
      });
      
      const tx = await walletClient.writeContract({
        address: EVENT_COMPLETION_FACTORY,
        abi: EventCompletionNFTFactoryABI,
        functionName: 'batchMintCompletionTokensForEvent',
        args: [eventId, validatedRecipients]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Completion NFTs batch minted successfully:', { txHash: tx, logs: receipt.logs?.length });
      return tx;
    } catch (err) {
      console.error('Failed to batch mint completion NFTs:', err);
      setError(err instanceof Error ? err.message : 'Failed to batch mint completion NFTs');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Create escrow for event payments
  const createEventEscrow = useCallback(async (
    eventId: string,
    title: string,
    eventDate: Date,
    organizer: string,
    fundRecipient: string,
    priceSystem: string,
    priceSelf: string
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const eventTimestamp = Math.floor(eventDate.getTime() / 1000);
      const systemAmount = parseUnits(priceSystem || '0', 18);
      const selfAmount = parseUnits(priceSelf || '0', 18);

      console.log('Creating event escrow:', { 
        eventId, 
        title, 
        eventTimestamp, 
        organizer, 
        fundRecipient,
        systemAmount: systemAmount.toString(),
        selfAmount: selfAmount.toString()
      });
      
      const tx = await walletClient.writeContract({
        address: EVENT_ESCROW_CONTRACT,
        abi: EventEscrowABI,
        functionName: 'createEvent',
        args: [
          eventId,
          title,
          eventTimestamp,
          organizer as `0x${string}`,
          fundRecipient as `0x${string}`,
          systemAmount,
          selfAmount
        ]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Event escrow created successfully:', { txHash: tx });
      return tx;
    } catch (err) {
      console.error('Failed to create event escrow:', err);
      setError(err instanceof Error ? err.message : 'Failed to create event escrow');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Process payment for event registration
  const processEventPayment = useCallback(async (
    eventId: string
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Processing event payment:', { eventId });
      
      const tx = await walletClient.writeContract({
        address: EVENT_ESCROW_CONTRACT,
        abi: EventEscrowABI,
        functionName: 'payForEvent',
        args: [eventId]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Event payment processed successfully:', { txHash: tx });
      return tx;
    } catch (err) {
      console.error('Failed to process event payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to process event payment');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  // Complete event and distribute funds
  const completeEventEscrow = useCallback(async (
    eventId: string
  ): Promise<string | null> => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Completing event escrow:', { eventId });
      
      const tx = await walletClient.writeContract({
        address: EVENT_ESCROW_CONTRACT,
        abi: EventEscrowABI,
        functionName: 'completeEvent',
        args: [eventId]
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx
      });
      
      console.log('Event escrow completed successfully:', { txHash: tx });
      return tx;
    } catch (err) {
      console.error('Failed to complete event escrow:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete event escrow');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, address, publicClient]);

  return {
    loading,
    error,
    deployRegistrationContract,
    deployCompletionContract,
    mintRegistrationNFT,
    mintCompletionNFT,
    batchMintCompletionNFTs,
    createEventEscrow,
    processEventPayment,
    completeEventEscrow
  };
}

// Helper hook for generating NFT metadata
export function useNFTMetadata() {
  const generateRegistrationMetadata = useCallback((
    event: Event,
    userAddress: string
  ) => {
    return {
      name: `${event.title} - Registration`,
      description: `Registration token for ${event.title} on ${new Date(event.event_date).toLocaleDateString()}`,
      image: event.event_image_url || '',
      attributes: [
        {
          trait_type: 'Event',
          value: event.title
        },
        {
          trait_type: 'Date',
          value: new Date(event.event_date).toLocaleDateString()
        },
        {
          trait_type: 'Type',
          value: 'Registration'
        },
        {
          trait_type: 'Attendee',
          value: userAddress
        }
      ]
    };
  }, []);

  const generateCompletionMetadata = useCallback((
    event: Event,
    userAddress: string,
    completionDate: Date
  ) => {
    return {
      name: `${event.title} - Completion Certificate`,
      description: `Completion certificate for attending ${event.title} on ${new Date(event.event_date).toLocaleDateString()}`,
      image: event.event_image_url || '',
      attributes: [
        {
          trait_type: 'Event',
          value: event.title
        },
        {
          trait_type: 'Event Date',
          value: new Date(event.event_date).toLocaleDateString()
        },
        {
          trait_type: 'Completion Date',
          value: completionDate.toLocaleDateString()
        },
        {
          trait_type: 'Type',
          value: 'Completion Certificate'
        },
        {
          trait_type: 'Recipient',
          value: userAddress
        },
        {
          trait_type: 'Pod',
          value: event.organizing_pod_id || 'Community'
        }
      ]
    };
  }, []);

  return {
    generateRegistrationMetadata,
    generateCompletionMetadata
  };
}