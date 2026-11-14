import { getClientHatIds } from '@/lib/hatRegistryClient';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// HATS contract address and ABI
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';

// Minimal HATS ABI for getImageURIForHat
const HATS_ABI = [
  {
    name: 'getImageURIForHat',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

// Create public client for Base
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Fetch the actual image URI for a HAT from the HATS protocol
 */
export async function fetchHatImageURI(hatId: string): Promise<string> {
  try {
    console.log('🎩 Fetching image URI for HAT:', hatId);

    // Convert hex string to bigint
    const hatIdBigInt = BigInt(hatId);

    const uri = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'getImageURIForHat',
      args: [hatIdBigInt],
    });

    console.log('🔍 Raw URI returned:', { hatId, uri });

    // Check if URI is empty or invalid
    if (!uri || uri === '' || uri === '0x' || uri === '0x0') {
      console.log('⚠️ Empty URI returned, using fallback');
      const fallbackUrl = `https://ui-avatars.com/api/?name=Executive+Pod&size=400&background=bfe7c6&color=000&bold=true`;
      return fallbackUrl;
    }

    // Convert IPFS URIs to HTTP gateway
    const imageUrl = uri.startsWith('ipfs://')
      ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
      : uri;

    console.log('✅ Retrieved HAT image:', { hatId, uri, imageUrl });
    return imageUrl;
  } catch (error) {
    console.error('❌ Failed to fetch HAT image URI:', error);

    // Fallback to generated image if HAT image fetch fails
    const fallbackUrl = `https://ui-avatars.com/api/?name=Executive+Pod&size=400&background=bfe7c6&color=000&bold=true`;
    console.log('📋 Using fallback image:', fallbackUrl);
    return fallbackUrl;
  }
}

/**
 * Fetch image URIs for multiple HATs
 */
export async function fetchMultipleHatImages(
  hatIds: string[],
): Promise<Record<string, string>> {
  console.log('🎩 Fetching images for multiple HATs:', hatIds.length);

  const results: Record<string, string> = {};

  // Fetch all images in parallel
  const promises = hatIds.map(async (hatId) => {
    const imageUri = await fetchHatImageURI(hatId);
    results[hatId] = imageUri;
  });

  await Promise.all(promises);

  console.log('✅ Retrieved all HAT images:', results);
  return results;
}

/**
 * The deployment's structural hats, from the hat registry (loaded at app
 * start). Keys are registry key names; unresolved keys are omitted.
 */
export function getExistingHats(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(getClientHatIds()).filter(([, id]) => Boolean(id)),
  ) as Record<string, string>;
}

/**
 * Fetch images for the deployment's structural hats
 */
export async function fetchAllExistingHatImages() {
  return await fetchMultipleHatImages(Object.values(getExistingHats()));
}
