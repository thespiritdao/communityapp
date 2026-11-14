import type { PublicClient } from 'viem';

/**
 * Service for managing pod images with hybrid approach:
 * 1. Local images for performance (primary)
 * 2. HAT contract URIs for canonical reference (secondary)
 * 3. Generated avatars as fallback (tertiary)
 */
export class PodImageService {
  /**
   * Get the best available image URL for a pod
   */
  static getPodImageUrl(pod: {
    name: string;
    pod_image_url?: string;
    management_hat_id?: string;
    id: string;
  }): string {
    try {
      // Ensure we have a valid pod object
      if (!pod || typeof pod.name !== 'string') {
        console.warn('Invalid pod object passed to getPodImageUrl:', pod);
        return this.getGeneratedAvatarUrl('Pod');
      }

      // 1. First try: Use local static image if available
      const localImageUrl = this.getLocalImageUrl(pod.name, pod.id);
      if (localImageUrl) {
        return localImageUrl;
      }

      // 2. Second try: Use stored pod_image_url from database
      if (
        pod.pod_image_url &&
        typeof pod.pod_image_url === 'string' &&
        !pod.pod_image_url.includes('ui-avatars.com')
      ) {
        return pod.pod_image_url;
      }

      // 3. Fallback: Generated avatar (what we currently use)
      return this.getGeneratedAvatarUrl(pod.name);
    } catch (error) {
      console.error('Error in getPodImageUrl:', error);
      // Safe fallback
      return this.getGeneratedAvatarUrl(pod?.name || 'Pod');
    }
  }

  /**
   * Get local static image URL for known pods
   */
  private static getLocalImageUrl(
    podName: string,
    podId: string,
  ): string | null {
    try {
      if (!podName || typeof podName !== 'string') {
        return null;
      }

      const localImages: Record<string, string> = {
        // Map pod names to actual local image file names
        'Executive Pod': '/images/pods/executivepod.png',
        'Development Pod': '/images/pods/devpod.png',
        'Infrastructure Pod': '/images/pods/infrastructure.png',
        'Pod Manager': '/images/pods/podmanager.png',
        'Event Manager': '/images/pods/eventmanager.png',
        'Chat Manager': '/images/pods/chatmanager.png',
        'Forum Manager': '/images/pods/forummanager.png',
        'Bounty Manager': '/images/pods/bountymanager.png',
        'Market Manager': '/images/pods/marketmanager.png',
      };

      // Lookup by id is deployment data; none are configured in code.
      const imagesByIds: Record<string, string> = {};

      // Try fuzzy matching for variations in naming
      const normalizedName = podName.toLowerCase().replace(/[^a-z]/g, '');
      const fuzzyMatches: Record<string, string> = {
        executivepod: '/images/pods/executivepod.png',
        executive: '/images/pods/executivepod.png',
        developmentpod: '/images/pods/devpod.png',
        development: '/images/pods/devpod.png',
        devpod: '/images/pods/devpod.png',
        dev: '/images/pods/devpod.png',
        infrastructure: '/images/pods/infrastructure.png',
        podmanager: '/images/pods/podmanager.png',
        eventmanager: '/images/pods/eventmanager.png',
        events: '/images/pods/eventmanager.png',
        chatmanager: '/images/pods/chatmanager.png',
        chat: '/images/pods/chatmanager.png',
        forummanager: '/images/pods/forummanager.png',
        forum: '/images/pods/forummanager.png',
        bountymanager: '/images/pods/bountymanager.png',
        bounty: '/images/pods/bountymanager.png',
        bounties: '/images/pods/bountymanager.png',
        marketmanager: '/images/pods/marketmanager.png',
        market: '/images/pods/marketmanager.png',
        marketplace: '/images/pods/marketmanager.png',
      };

      return (
        localImages[podName] ||
        (podId && imagesByIds[podId]) ||
        fuzzyMatches[normalizedName] ||
        null
      );
    } catch (error) {
      console.warn('Error in getLocalImageUrl:', error);
      return null;
    }
  }

  /**
   * Get generated avatar URL (current fallback method)
   */
  private static getGeneratedAvatarUrl(name: string): string {
    try {
      const safeName = name && typeof name === 'string' ? name : 'Pod';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&size=400&background=bfe7c6&color=000&bold=true`;
    } catch (error) {
      console.warn('Error generating avatar URL:', error);
      return `https://ui-avatars.com/api/?name=Pod&size=400&background=bfe7c6&color=000&bold=true`;
    }
  }

  /**
   * Fetch image URI from HAT contract (for future enhancement)
   * This would be used to populate/update the database with canonical HAT images
   */
  static async getHatImageUri(
    hatId: string,
    publicClient: PublicClient,
  ): Promise<string | null> {
    try {
      if (!hatId || !process.env.NEXT_PUBLIC_HATS_CONTRACT || !publicClient) {
        return null;
      }

      // Additional validation
      if (typeof hatId !== 'string' || !publicClient.readContract) {
        console.warn('Invalid parameters for getHatImageUri:', {
          hatId,
          hasClient: !!publicClient,
        });
        return null;
      }

      const imageUri = await publicClient.readContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'getImageURIForHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [{ name: '_uri', type: 'string' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getImageURIForHat',
        args: [BigInt(hatId)],
      });

      return imageUri && typeof imageUri === 'string' ? imageUri : null;
    } catch (error) {
      console.warn('Failed to fetch HAT image URI:', error);
      return null;
    }
  }

  /**
   * Sync HAT images to database (background job)
   * Call this periodically to update pod_image_url with canonical HAT URIs
   */
  static async syncHatImagesToDatabase(
    pods: Array<{ id: string; management_hat_id?: string }>,
    publicClient: PublicClient,
    updateCallback: (podId: string, imageUri: string) => Promise<void>,
  ): Promise<void> {
    try {
      if (
        !pods ||
        !Array.isArray(pods) ||
        !publicClient ||
        typeof updateCallback !== 'function'
      ) {
        console.warn('Invalid parameters for syncHatImagesToDatabase');
        return;
      }

      console.log('🔄 Syncing HAT images to database...');

      for (const pod of pods) {
        if (!pod || !pod.id || !pod.management_hat_id) continue;

        try {
          const hatImageUri = await this.getHatImageUri(
            pod.management_hat_id,
            publicClient,
          );
          if (hatImageUri && hatImageUri !== '') {
            await updateCallback(pod.id, hatImageUri);
            console.log(`✅ Updated image for pod ${pod.id}: ${hatImageUri}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to sync image for pod ${pod.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in syncHatImagesToDatabase:', error);
    }
  }

  /**
   * Get actual local image paths (for reference)
   */
  static getAvailableImagePaths(): Record<string, string> {
    return {
      'Executive Pod': 'public/images/pods/executivepod.png',
      'Development Pod': 'public/images/pods/devpod.png',
      'Infrastructure Pod': 'public/images/pods/infrastructure.png',
      'Pod Manager': 'public/images/pods/podmanager.png',
      'Event Manager': 'public/images/pods/eventmanager.png',
      'Chat Manager': 'public/images/pods/chatmanager.png',
      'Forum Manager': 'public/images/pods/forummanager.png',
      'Bounty Manager': 'public/images/pods/bountymanager.png',
      'Market Manager': 'public/images/pods/marketmanager.png',
    };
  }
}

export default PodImageService;
