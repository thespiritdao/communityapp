/**
 * IPFS Upload Service for Bid Metadata
 *
 * This service handles uploading bid metadata to IPFS before on-chain bid placement.
 * The IPFS hash is then stored on-chain via the placeBid() function.
 */

import { getAuthHeaders } from '@/lib/authHeaders';
import { pinJsonViaServer } from '@/lib/ipfsPinClient';

export interface BidMetadata {
  experience: string;
  planOfAction: string;
  deliverables: Array<{
    description: string;
    due_date: string;
    payment_amount: string;
  }>;
  timeline: string;
  proposedAmount: string;
  paymentOption: string;
  paymentDetails: any;
  additionalNotes: string;
  answers: Record<string, string>;
  bidder_address: string;
  bounty_id: string;
  timestamp: number;
}

/**
 * Upload bid metadata to IPFS via the API route
 *
 * @param bidData - The bid metadata to upload
 * @returns The IPFS hash (CID) of the uploaded content
 * @throws Error if upload fails
 */
export async function uploadBidToIPFS(bidData: BidMetadata): Promise<string> {
  try {
    console.log('📤 Uploading bid metadata to IPFS...', {
      bounty_id: bidData.bounty_id,
      bidder: bidData.bidder_address,
      timestamp: bidData.timestamp,
    });

    // Same server pin path as bounty metadata, hat details and agreements
    // (POST /api/ipfs/pin): one Pinata code path to keep working.
    const ipfsHash = await pinJsonViaServer(
      'bid_metadata',
      bidData,
      `bid-${bidData.bounty_id}-${bidData.bidder_address.slice(0, 8)}-${bidData.timestamp}`,
      { bounty_id: String(bidData.bounty_id), bidder: bidData.bidder_address },
    );

    console.log('✅ Bid uploaded to IPFS:', ipfsHash);
    return ipfsHash;
  } catch (error) {
    console.error('❌ Error uploading bid to IPFS:', error);
    throw error;
  }
}

/**
 * Fetch bid metadata from IPFS via the API route
 *
 * @param ipfsHash - The IPFS hash (CID) to fetch
 * @returns The bid metadata
 * @throws Error if fetch fails
 */
export async function fetchBidFromIPFS(ipfsHash: string): Promise<BidMetadata> {
  try {
    console.log('📥 Fetching bid metadata from IPFS:', ipfsHash);

    const response = await fetch('/api/bounty/ipfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({
        action: 'fetch',
        ipfsHash,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        `Failed to fetch bid from IPFS: ${errorData.error || response.statusText}`,
      );
    }

    const { metadata } = await response.json();

    if (!metadata) {
      throw new Error('No metadata returned from IPFS');
    }

    console.log('✅ Bid fetched from IPFS');
    return metadata as BidMetadata;
  } catch (error) {
    console.error('❌ Error fetching bid from IPFS:', error);
    throw error;
  }
}
