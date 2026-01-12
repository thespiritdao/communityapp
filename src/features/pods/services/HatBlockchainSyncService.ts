/**
 * HatBlockchainSyncService
 *
 * Service for syncing HAT roles from Hats Protocol blockchain to local database.
 * This is critical for handling cases where transaction receipts timeout or fail,
 * but the HAT was successfully created on-chain.
 *
 * Key Functions:
 * - Fetch all child HATs under a parent management HAT
 * - Parse HAT details from blockchain
 * - Create missing database entries for on-chain HATs
 * - Sync HAT metadata and status
 */

import type { PublicClient } from 'viem';
import HatsProtocolABI from '@/abis/HatsProtocol.json';
import { PodRolePermissionsService } from './PodRolePermissionsService';

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

export interface HatDetails {
  hatId: string;
  details: string;
  maxSupply: number;
  supply: number;
  eligibility: string;
  toggle: string;
  imageURI: string;
  lastHatId: number;
  mutable: boolean;
  active: boolean;
}

export interface SyncResult {
  success: boolean;
  newRolesFound: number;
  rolesCreated: number;
  errors: string[];
  syncedHats: HatDetails[];
}

/**
 * Parse HAT details from blockchain response
 */
function parseHatDetails(hatId: string, response: any): HatDetails {
  return {
    hatId,
    details: response[0] as string,
    maxSupply: Number(response[1]),
    supply: Number(response[2]),
    eligibility: response[3] as string,
    toggle: response[4] as string,
    imageURI: response[5] as string,
    lastHatId: Number(response[6]),
    mutable: response[7] as boolean,
    active: response[8] as boolean,
  };
}

/**
 * Extract role name from HAT details JSON
 * HAT details are stored as JSON string with format: {"type": "role", "name": "Role Name", ...}
 */
function extractRoleName(detailsJson: string, fallbackHatId: string): string {
  try {
    if (!detailsJson || detailsJson.trim() === '') {
      return `Role ${fallbackHatId.slice(-8)}`;
    }

    const details = JSON.parse(detailsJson);

    if (details.name && typeof details.name === 'string') {
      return details.name;
    }

    if (details.data?.name && typeof details.data.name === 'string') {
      return details.data.name;
    }

    return `Role ${fallbackHatId.slice(-8)}`;
  } catch (error) {
    console.warn('Failed to parse HAT details JSON:', detailsJson, error);
    return `Role ${fallbackHatId.slice(-8)}`;
  }
}

/**
 * Calculate child HAT IDs for a parent HAT
 *
 * HAT ID structure (uint256 / 32 bytes):
 * - Top-level HAT: 0x0000008800010000000000000000000000000000000000000000000000000000
 * - Child HAT #1:  0x0000008800010001000000000000000000000000000000000000000000000000
 * - Child HAT #2:  0x0000008800010002000000000000000000000000000000000000000000000000
 *
 * Each level uses 4 hex digits (2 bytes), so children increment in that section.
 */
function calculateChildHatIds(parentHatId: string, lastHatId: number): string[] {
  const childIds: string[] = [];

  if (lastHatId === 0) {
    // No children yet
    return childIds;
  }

  // Convert parent HAT ID to BigInt
  const parentHatBigInt = BigInt(parentHatId);

  // Find which level this parent is at by checking the HAT ID structure
  // Count how many non-zero 16-bit segments there are
  const hatIdHex = parentHatId.replace('0x', '').padStart(64, '0');

  // Split into 16-bit (4 hex char) segments
  const segments: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    const segment = hatIdHex.substring(i, i + 4);
    segments.push(parseInt(segment, 16));
  }

  // Find the level (first zero segment after non-zero segments)
  let level = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== 0) {
      level = i + 1;
    }
  }

  // Generate child HAT IDs
  // Children are created by incrementing at the next level
  const childLevelOffset = level * 16; // Each level is 16 bits (4 hex chars)

  for (let childIndex = 1; childIndex <= lastHatId; childIndex++) {
    // Shift child index to the correct level position
    const childOffset = BigInt(childIndex) << BigInt((15 - level) * 16);
    const childHatId = parentHatBigInt | childOffset;

    // Convert to 0x-prefixed hex string
    const childHatIdHex = '0x' + childHatId.toString(16).padStart(64, '0');
    childIds.push(childHatIdHex);
  }

  return childIds;
}

/**
 * Fetch HAT details from blockchain
 */
export async function fetchHatDetails(
  publicClient: PublicClient,
  hatId: string
): Promise<HatDetails | null> {
  try {
    console.log(`🔍 Fetching HAT details from blockchain: ${hatId}`);

    const response = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HatsProtocolABI,
      functionName: 'viewHat',
      args: [BigInt(hatId)],
    });

    const hatDetails = parseHatDetails(hatId, response);
    console.log(`✅ Fetched HAT details:`, hatDetails);

    return hatDetails;
  } catch (error) {
    console.error(`❌ Failed to fetch HAT details for ${hatId}:`, error);
    return null;
  }
}

/**
 * Fetch all child HATs under a parent management HAT
 */
export async function fetchChildHats(
  publicClient: PublicClient,
  parentHatId: string
): Promise<HatDetails[]> {
  console.log(`🔍 Fetching child HATs for parent: ${parentHatId}`);

  try {
    // First, get parent HAT details to find lastHatId
    const parentDetails = await fetchHatDetails(publicClient, parentHatId);

    if (!parentDetails) {
      console.error('❌ Failed to fetch parent HAT details');
      return [];
    }

    console.log(`📊 Parent HAT has ${parentDetails.lastHatId} children`);

    if (parentDetails.lastHatId === 0) {
      console.log('ℹ️ No child HATs found');
      return [];
    }

    // Calculate child HAT IDs
    const childHatIds = calculateChildHatIds(parentHatId, parentDetails.lastHatId);
    console.log(`🎯 Generated ${childHatIds.length} child HAT IDs:`, childHatIds);

    // Fetch details for each child HAT
    const childHats: HatDetails[] = [];

    for (const childHatId of childHatIds) {
      const childDetails = await fetchHatDetails(publicClient, childHatId);

      if (childDetails) {
        childHats.push(childDetails);
      }
    }

    console.log(`✅ Successfully fetched ${childHats.length} child HATs`);
    return childHats;

  } catch (error) {
    console.error('❌ Failed to fetch child HATs:', error);
    return [];
  }
}

/**
 * Sync roles from blockchain to database
 *
 * This function:
 * 1. Fetches all child HATs from the parent management HAT
 * 2. Compares with existing database entries
 * 3. Creates database entries for missing HATs
 * 4. Updates existing entries with latest blockchain data
 */
export async function syncRolesFromBlockchain(
  publicClient: PublicClient,
  podId: string,
  managementHatId: string,
  createdBy: string
): Promise<SyncResult> {
  console.log('🔄 Starting blockchain sync for pod:', podId);
  console.log('📍 Management HAT ID:', managementHatId);

  const result: SyncResult = {
    success: false,
    newRolesFound: 0,
    rolesCreated: 0,
    errors: [],
    syncedHats: [],
  };

  try {
    // Step 1: Fetch all child HATs from blockchain
    const childHats = await fetchChildHats(publicClient, managementHatId);
    result.syncedHats = childHats;

    if (childHats.length === 0) {
      console.log('ℹ️ No child HATs found on blockchain');
      result.success = true;
      return result;
    }

    console.log(`📦 Found ${childHats.length} HATs on blockchain`);

    // Step 2: Get existing roles from database
    const existingRoles = await PodRolePermissionsService.getPodRolePermissions(podId);
    const existingHatIds = new Set(
      existingRoles
        .map(role => role.token_address)
        .filter((hatId): hatId is string => !!hatId)
    );

    console.log(`📊 Found ${existingHatIds.size} existing roles in database`);

    // Step 3: Create database entries for missing HATs
    for (const hat of childHats) {
      if (existingHatIds.has(hat.hatId)) {
        console.log(`⏭️ HAT already in database: ${hat.hatId}`);
        continue;
      }

      result.newRolesFound++;

      try {
        const roleName = extractRoleName(hat.details, hat.hatId);

        console.log(`💾 Creating database entry for new HAT:`, {
          hatId: hat.hatId,
          roleName,
          maxSupply: hat.maxSupply,
          supply: hat.supply,
          active: hat.active,
        });

        await PodRolePermissionsService.createRolePermission({
          pod_id: podId,
          token_address: hat.hatId,
          role_name: roleName,
          permissions: {
            // Default permissions - can be updated later via UI
            chatAccess: false,
            chatModeration: false,
            governanceParticipation: false,
            eventCreation: false,
            treasuryViewing: false,
            treasuryManagement: false,
            memberManagement: false,
            subPodCreation: false,
            roleAssignment: false,
            forumAccess: false,
            forumModeration: false,
            bountyManagement: false,
            marketplaceAccess: false,
            marketplaceManage: false,
          },
          eligibility_criteria: [],
          max_holders: hat.maxSupply,
          current_holders: hat.supply,
          created_by: createdBy,
          is_active: hat.active,
        });

        result.rolesCreated++;
        console.log(`✅ Created database entry for HAT: ${hat.hatId}`);

      } catch (createError) {
        const errorMsg = `Failed to create database entry for ${hat.hatId}: ${createError}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Blockchain sync complete:`, {
      totalHats: childHats.length,
      newRolesFound: result.newRolesFound,
      rolesCreated: result.rolesCreated,
      errors: result.errors.length,
    });

    result.success = result.errors.length === 0;
    return result;

  } catch (error) {
    const errorMsg = `Blockchain sync failed: ${error}`;
    console.error(`❌ ${errorMsg}`);
    result.errors.push(errorMsg);
    result.success = false;
    return result;
  }
}

/**
 * Quick sync - just checks if a specific HAT exists in database and creates it if missing
 * Useful as a fast fallback when we know a specific HAT was just created
 */
export async function quickSyncSingleHat(
  publicClient: PublicClient,
  podId: string,
  hatId: string,
  createdBy: string
): Promise<boolean> {
  console.log(`🔄 Quick sync for single HAT: ${hatId}`);

  try {
    // Check if already in database
    const existingRoles = await PodRolePermissionsService.getPodRolePermissions(podId);
    const exists = existingRoles.some(role => role.token_address === hatId);

    if (exists) {
      console.log(`✅ HAT already in database: ${hatId}`);
      return true;
    }

    // Fetch from blockchain
    const hatDetails = await fetchHatDetails(publicClient, hatId);

    if (!hatDetails) {
      console.error(`❌ Failed to fetch HAT details from blockchain: ${hatId}`);
      return false;
    }

    const roleName = extractRoleName(hatDetails.details, hatDetails.hatId);

    console.log(`💾 Creating database entry for HAT:`, {
      hatId: hatDetails.hatId,
      roleName,
      maxSupply: hatDetails.maxSupply,
    });

    await PodRolePermissionsService.createRolePermission({
      pod_id: podId,
      token_address: hatDetails.hatId,
      role_name: roleName,
      permissions: {
        chatAccess: false,
        chatModeration: false,
        governanceParticipation: false,
        eventCreation: false,
        treasuryViewing: false,
        treasuryManagement: false,
        memberManagement: false,
        subPodCreation: false,
        roleAssignment: false,
        forumAccess: false,
        forumModeration: false,
        bountyManagement: false,
        marketplaceAccess: false,
        marketplaceManage: false,
      },
      eligibility_criteria: [],
      max_holders: hatDetails.maxSupply,
      current_holders: hatDetails.supply,
      created_by: createdBy,
      is_active: hatDetails.active,
    });

    console.log(`✅ Quick sync successful for HAT: ${hatId}`);
    return true;

  } catch (error) {
    console.error(`❌ Quick sync failed for HAT ${hatId}:`, error);
    return false;
  }
}

export const HatBlockchainSyncService = {
  fetchHatDetails,
  fetchChildHats,
  syncRolesFromBlockchain,
  quickSyncSingleHat,
};
