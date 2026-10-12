/**
 * IPFS Service for Pod Agreement Storage
 * Uploads agreement text to IPFS via Pinata for on-chain eligibility criteria
 */

import { pinJsonViaServer } from '@/lib/ipfsPinClient';

interface AgreementMetadata {
  agreement_text: string;
  agreement_id: string;
  pod_id?: string;
  role_type?: 'leader' | 'member';
  created_at: string;
  version: string;
}

export class AgreementIPFSService {
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

      // Pinned server-side: the Pinata key stays off the browser.
      const cid = await pinJsonViaServer(
        'pod_agreement',
        metadata,
        `agreement-${agreementId}-${Date.now()}`,
        {
          agreement_id: agreementId,
          pod_id: podId || 'unknown',
          role_type: roleType || 'member',
        },
      );
      console.log('✅ Agreement uploaded to IPFS:', cid);

      return cid;
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
   * Pinning goes through /api/ipfs/pin; the server reports if Pinata is
   * missing, so the client always offers the upload.
   */
  static isConfigured(): boolean {
    return true;
  }

  /**
   * Get IPFS gateway URL for a given CID
   */
  static getGatewayUrl(ipfsHash: string): string {
    return `${this.PINATA_GATEWAY}/${ipfsHash}`;
  }
}
