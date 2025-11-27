import { HatsDetailsClient } from '@hatsprotocol/details-sdk';
import * as z from 'zod';

// Hats Details SDK Schema (matches the official schema)
const hatsDetailsSchema = z.object({
  type: z.literal('1.0'),
  data: z.object({
    name: z.string(),
    description: z.string().optional(),
    responsibilities: z
      .array(
        z.object({
          label: z.string(),
          description: z.string().optional(),
          link: z.string().optional(),
          imageUrl: z.string().optional(),
        }),
      )
      .optional(),
    authorities: z
      .array(
        z.object({
          label: z.string(),
          description: z.string().optional(),
          link: z.string().optional(),
          imageUrl: z.string().optional(),
          gate: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

export type HatsDetailsMetadata = z.infer<typeof hatsDetailsSchema>;

/**
 * Service for managing HAT metadata using the Hats Details SDK
 * Handles IPFS storage of structured metadata for Hats Protocol
 */
export class HatsDetailsService {
  private static client: HatsDetailsClient<typeof hatsDetailsSchema> | null =
    null;

  /**
   * Initialize the Hats Details Client
   */
  private static initializeClient(): HatsDetailsClient<
    typeof hatsDetailsSchema
  > {
    if (!this.client) {
      const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;

      if (!pinataJwt || pinataJwt === 'your_pinata_jwt_token_here') {
        throw new Error(
          'NEXT_PUBLIC_PINATA_JWT environment variable is required. Get your JWT from https://app.pinata.cloud/keys',
        );
      }

      this.client = new HatsDetailsClient({
        schema: hatsDetailsSchema,
        provider: 'pinata',
        pinata: {
          pinningKey: pinataJwt,
          gateway:
            process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
            'https://gateway.pinata.cloud',
          ...(process.env.NEXT_PUBLIC_PINATA_GATEWAY_KEY && {
            gatewayKey: process.env.NEXT_PUBLIC_PINATA_GATEWAY_KEY,
          }),
        },
      });
    }

    return this.client;
  }

  /**
   * Create structured metadata for a pod/hat
   */
  static createPodMetadata(config: {
    name: string;
    description: string;
    podType: 'management' | 'membership';
    podLeaders?: string[];
    treasuryEnabled?: boolean;
    eligibilityRules?: any[];
  }): HatsDetailsMetadata {
    const responsibilities = [];
    const authorities = [];

    // Define responsibilities based on pod type
    if (config.podType === 'management') {
      responsibilities.push(
        {
          label: 'Pod Leadership',
          description:
            'Lead and coordinate pod activities and member engagement',
        },
        {
          label: 'Strategic Planning',
          description: 'Develop and execute strategic initiatives for the pod',
        },
        {
          label: 'Member Oversight',
          description:
            'Guide and support pod members in their roles and contributions',
        },
      );

      authorities.push(
        {
          label: 'Member Management',
          description: 'Authority to add, remove, and manage pod members',
        },
        {
          label: 'Role Assignment',
          description:
            'Authority to assign and modify member roles within the pod',
        },
      );

      if (config.treasuryEnabled) {
        authorities.push({
          label: 'Treasury Management',
          description:
            'Authority to manage pod treasury funds and approve expenditures',
        });
      }
    } else {
      // membership hat
      responsibilities.push(
        {
          label: 'Active Participation',
          description: 'Actively participate in pod activities and initiatives',
        },
        {
          label: 'Collaboration',
          description: 'Work constructively with other pod members',
        },
        {
          label: 'Accountability',
          description:
            'Follow pod guidelines and fulfill assigned responsibilities',
        },
      );

      authorities.push(
        {
          label: 'Pod Access',
          description: 'Access to pod resources, channels, and activities',
        },
        {
          label: 'Voting Rights',
          description:
            'Right to participate in pod governance and decision-making',
        },
      );
    }

    return {
      type: '1.0',
      data: {
        name: config.name,
        description: config.description,
        responsibilities,
        authorities,
      },
    };
  }

  /**
   * Upload metadata to IPFS and return the hash
   */
  static async uploadMetadata(metadata: HatsDetailsMetadata): Promise<string> {
    try {
      console.log('🔗 Uploading HAT metadata to IPFS:', {
        name: metadata.data.name,
        hasDescription: !!metadata.data.description,
        responsibilitiesCount: metadata.data.responsibilities?.length || 0,
        authoritiesCount: metadata.data.authorities?.length || 0,
      });

      const client = this.initializeClient();
      const ipfsHash = await client.pin(metadata);

      console.log('✅ Successfully uploaded metadata to IPFS:', {
        hash: ipfsHash,
        name: metadata.data.name,
      });

      return ipfsHash;
    } catch (error) {
      console.error('❌ Failed to upload metadata to IPFS:', error);
      throw new Error(
        `IPFS upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Retrieve metadata from IPFS hash
   */
  static async getMetadata(
    ipfsHash: string,
  ): Promise<HatsDetailsMetadata | null> {
    try {
      console.log('🔍 Retrieving HAT metadata from IPFS:', ipfsHash);

      const client = this.initializeClient();
      const result = await client.get(ipfsHash);

      if (result.error) {
        console.error(
          '❌ Error retrieving metadata from IPFS:',
          result.error.message,
        );
        return null;
      }

      const metadata = result.parsedData || result.rawData;

      console.log('✅ Successfully retrieved metadata from IPFS:', {
        hash: ipfsHash,
        hasData: !!metadata,
      });

      return metadata as HatsDetailsMetadata;
    } catch (error) {
      console.error('❌ Failed to retrieve metadata from IPFS:', error);
      return null;
    }
  }

  /**
   * Create metadata for management hat
   */
  static async createManagementHatMetadata(config: {
    name: string;
    description: string;
    podLeaders: string[];
    treasuryEnabled: boolean;
    eligibilityRules?: any[];
  }): Promise<string> {
    const metadata = this.createPodMetadata({
      ...config,
      podType: 'management',
    });

    return await this.uploadMetadata(metadata);
  }

  /**
   * Create metadata for membership hat
   */
  static async createMembershipHatMetadata(config: {
    name: string;
    description: string;
    eligibilityRules?: any[];
  }): Promise<string> {
    const membershipName = `${config.name} Member`;
    const membershipDescription = `Member of the ${config.name} pod with access to pod resources and voting rights.`;

    const metadata = this.createPodMetadata({
      name: membershipName,
      description: membershipDescription,
      podType: 'membership',
      eligibilityRules: config.eligibilityRules,
    });

    return await this.uploadMetadata(metadata);
  }

  /**
   * Validate IPFS hash format
   */
  static isValidIPFSHash(hash: string): boolean {
    // Basic IPFS hash validation (CIDv0 or CIDv1)
    const ipfsRegex =
      /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58}|[1-9A-HJ-NP-Za-km-z]{46,})$/;
    return ipfsRegex.test(hash);
  }

  /**
   * Test Pinata connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const testMetadata: HatsDetailsMetadata = {
        type: '1.0',
        data: {
          name: 'Connection Test',
          description: 'Test metadata to verify Pinata connection',
        },
      };

      await this.uploadMetadata(testMetadata);
      console.log('✅ Pinata connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Pinata connection test failed:', error);
      return false;
    }
  }
}

export default HatsDetailsService;
