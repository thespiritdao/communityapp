/**
 * IPFS Service for Bounty Metadata Storage
 * Uploads go through the server (/api/ipfs/pin); reads use the public gateway.
 */

import { pinJsonViaServer } from '@/lib/ipfsPinClient';

interface BountyMetadata {
  title: string;
  description: string;
  category: string;
  requirements?: string[];
  questions?: string[];
  work_requirements?: string[];
  token_gating?: {
    required_tokens?: Array<{
      token_id: string;
      token_name: string;
      token_type: string;
      minimum_balance?: string;
    }>;
    restriction_level?: string;
  };
  creator_address?: string;
  created_at?: string;
  version?: string;
}

export class BountyIPFSService {
  private static readonly PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

  /**
   * Upload bounty metadata to IPFS. Pinned server-side via /api/ipfs/pin so
   * the Pinata key stays off the browser.
   */
  static async uploadMetadata(metadata: BountyMetadata): Promise<string> {
    try {
      const enrichedMetadata = {
        ...metadata,
        version: '1.0',
        created_at: new Date().toISOString(),
      };

      const cid = await pinJsonViaServer(
        'bounty_metadata',
        enrichedMetadata,
        `bounty-${metadata.title.slice(0, 60)}-${Date.now()}`,
        { category: metadata.category || 'uncategorized' },
      );
      console.log('✅ Metadata uploaded to IPFS:', cid);
      return cid;
    } catch (error) {
      console.error('Error uploading to IPFS:', error);
      throw new Error(`Failed to upload metadata to IPFS: ${error}`);
    }
  }

  /**
   * Fetch bounty metadata from IPFS via Pinata
   */
  static async fetchMetadata(ipfsHash: string): Promise<BountyMetadata> {
    if (!ipfsHash) {
      throw new Error('Invalid IPFS hash');
    }

    try {
      // Use Pinata gateway for fetching
      const response = await fetch(`${this.PINATA_GATEWAY}/${ipfsHash}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
      }

      const metadata: BountyMetadata = await response.json();
      return metadata;
    } catch (error) {
      console.error('Error fetching from IPFS:', error);

      // Fallback to public gateway if Pinata gateway fails
      try {
        const fallbackResponse = await fetch(
          `https://ipfs.io/ipfs/${ipfsHash}`,
        );
        if (fallbackResponse.ok) {
          return await fallbackResponse.json();
        }
      } catch (fallbackError) {
        console.error('Fallback gateway also failed:', fallbackError);
      }

      throw new Error(`Failed to fetch metadata from IPFS: ${error}`);
    }
  }

  /**
   * Upload multiple bounty metadata in batch
   */
  static async uploadBatch(metadataArray: BountyMetadata[]): Promise<string[]> {
    const uploadPromises = metadataArray.map((metadata) =>
      this.uploadMetadata(metadata),
    );

    try {
      const hashes = await Promise.all(uploadPromises);
      return hashes;
    } catch (error) {
      console.error('Batch upload failed:', error);
      throw error;
    }
  }

  /**
   * Generate gateway URL for IPFS content
   */
  static getGatewayUrl(ipfsHash: string): string {
    return `${this.PINATA_GATEWAY}/${ipfsHash}`;
  }

  /**
   * Validate IPFS hash format
   */
  static isValidIPFSHash(hash: string): boolean {
    // CIDv0: starts with Qm and is 46 characters
    // CIDv1: starts with b and is 59 characters
    const cidv0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidv1Regex = /^b[A-Za-z2-7]{58}$/;

    return cidv0Regex.test(hash) || cidv1Regex.test(hash);
  }
}
