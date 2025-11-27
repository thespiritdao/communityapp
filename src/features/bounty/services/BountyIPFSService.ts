/**
 * IPFS Service for Bounty Metadata Storage
 * Uses existing Pinata JWT for authentication
 */

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

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export class BountyIPFSService {
  private static readonly PINATA_API_URL = 'https://api.pinata.cloud';
  private static readonly PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

  /**
   * Upload bounty metadata to IPFS via Pinata
   */
  static async uploadMetadata(metadata: BountyMetadata): Promise<string> {
    const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

    if (!jwt) {
      throw new Error('Pinata JWT not configured');
    }

    try {
      // Add version and timestamp to metadata
      const enrichedMetadata = {
        ...metadata,
        version: '1.0',
        created_at: new Date().toISOString(),
      };

      const response = await fetch(
        `${this.PINATA_API_URL}/pinning/pinJSONToIPFS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pinataContent: enrichedMetadata,
            pinataMetadata: {
              name: `bounty-${metadata.title}-${Date.now()}`,
              keyvalues: {
                type: 'bounty_metadata',
                category: metadata.category,
                has_token_gating:
                  !!metadata.token_gating?.required_tokens?.length,
                creator: metadata.creator_address || 'unknown',
              },
            },
            pinataOptions: {
              cidVersion: 1,
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pinata upload failed: ${error}`);
      }

      const data: PinataResponse = await response.json();
      console.log('✅ Metadata uploaded to IPFS:', data.IpfsHash);

      return data.IpfsHash;
    } catch (error) {
      console.error('Error uploading to Pinata:', error);
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
   * Pin existing IPFS hash (useful for ensuring persistence)
   */
  static async pinExistingHash(
    ipfsHash: string,
    name?: string,
  ): Promise<boolean> {
    const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

    if (!jwt) {
      throw new Error('Pinata JWT not configured');
    }

    try {
      const response = await fetch(`${this.PINATA_API_URL}/pinning/pinByHash`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hashToPin: ipfsHash,
          pinataMetadata: {
            name: name || `bounty-pinned-${Date.now()}`,
          },
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error pinning hash:', error);
      return false;
    }
  }

  /**
   * Unpin IPFS hash (cleanup)
   */
  static async unpinHash(ipfsHash: string): Promise<boolean> {
    const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

    if (!jwt) {
      throw new Error('Pinata JWT not configured');
    }

    try {
      const response = await fetch(
        `${this.PINATA_API_URL}/pinning/unpin/${ipfsHash}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
      );

      return response.ok;
    } catch (error) {
      console.error('Error unpinning hash:', error);
      return false;
    }
  }

  /**
   * Get pinned content list (useful for management)
   */
  static async listPinnedBounties(limit: number = 10): Promise<any[]> {
    const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

    if (!jwt) {
      throw new Error('Pinata JWT not configured');
    }

    try {
      const queryParams = new URLSearchParams({
        status: 'pinned',
        pageLimit: limit.toString(),
        'metadata[keyvalues]': JSON.stringify({
          type: { value: 'bounty_metadata', op: 'eq' },
        }),
      });

      const response = await fetch(
        `${this.PINATA_API_URL}/data/pinList?${queryParams}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to list pinned content');
      }

      const data = await response.json();
      return data.rows || [];
    } catch (error) {
      console.error('Error listing pinned bounties:', error);
      return [];
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
