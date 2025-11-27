/**
 * IPFS Service for Pod Agreement Storage
 * Uploads agreement text to IPFS via Pinata for on-chain eligibility criteria
 */

interface AgreementMetadata {
  agreement_text: string;
  agreement_id: string;
  pod_id?: string;
  role_type?: 'leader' | 'member';
  created_at: string;
  version: string;
}

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export class AgreementIPFSService {
  private static readonly PINATA_API_URL = 'https://api.pinata.cloud';
  private static readonly PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

  /**
   * Upload agreement text to IPFS via Pinata
   * Returns the IPFS CID (Content Identifier)
   */
  static async uploadAgreement(
    agreementText: string,
    agreementId: string,
    podId?: string,
    roleType?: 'leader' | 'member',
  ): Promise<string> {
    const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

    if (!jwt) {
      throw new Error(
        'Pinata JWT not configured - add NEXT_PUBLIC_PINATA_JWT to environment variables',
      );
    }

    if (!agreementText || agreementText.trim().length === 0) {
      throw new Error('Agreement text cannot be empty');
    }

    try {
      console.log('📤 Uploading agreement to IPFS...', {
        agreementId,
        textLength: agreementText.length,
        podId,
      });

      // Create metadata object
      const metadata: AgreementMetadata = {
        agreement_text: agreementText.trim(),
        agreement_id: agreementId,
        pod_id: podId,
        role_type: roleType,
        created_at: new Date().toISOString(),
        version: '1.0',
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
            pinataContent: metadata,
            pinataMetadata: {
              name: `agreement-${agreementId}-${Date.now()}`,
              keyvalues: {
                type: 'pod_agreement',
                agreement_id: agreementId,
                pod_id: podId || 'unknown',
                role_type: roleType || 'member',
                created: new Date().toISOString(),
              },
            },
            pinataOptions: {
              cidVersion: 1, // Use CIDv1 for better compatibility
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Pinata upload failed:', errorText);
        throw new Error(
          `Pinata API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: PinataResponse = await response.json();
      console.log('✅ Agreement uploaded to IPFS:', data.IpfsHash);

      return data.IpfsHash;
    } catch (error: any) {
      console.error('Error uploading agreement to IPFS:', error);
      throw new Error(
        `Failed to upload agreement to IPFS: ${error.message || error}`,
      );
    }
  }

  /**
   * Fetch agreement from IPFS
   * Returns the agreement text
   */
  static async fetchAgreement(ipfsHash: string): Promise<string> {
    if (!ipfsHash || ipfsHash.trim().length === 0) {
      throw new Error('Invalid IPFS hash');
    }

    try {
      console.log('📥 Fetching agreement from IPFS:', ipfsHash);

      const response = await fetch(`${this.PINATA_GATEWAY}/${ipfsHash}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS: ${response.status}`);
      }

      const metadata: AgreementMetadata = await response.json();

      console.log('✅ Agreement fetched from IPFS');

      return metadata.agreement_text;
    } catch (error: any) {
      console.error('Error fetching agreement from IPFS:', error);
      throw new Error(
        `Failed to fetch agreement from IPFS: ${error.message || error}`,
      );
    }
  }

  /**
   * Check if IPFS/Pinata is configured
   */
  static isConfigured(): boolean {
    return !!process.env.NEXT_PUBLIC_PINATA_JWT;
  }

  /**
   * Get IPFS gateway URL for a given CID
   */
  static getGatewayUrl(ipfsHash: string): string {
    return `${this.PINATA_GATEWAY}/${ipfsHash}`;
  }
}
