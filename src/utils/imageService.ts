/**
 * Image service for handling IPFS and local images with CSP compliance
 * Prioritizes local/database images over IPFS
 */

import { supabase } from './supabaseClient';

export interface ImageSource {
  url: string;
  type: 'local' | 'ipfs' | 'external';
  priority: number;
}

export class ImageService {
  private static ipfsGateways = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
  ];

  /**
   * Prioritize image sources: Local > External HTTPS > IPFS
   */
  static prioritizeImageSources(sources: string[]): ImageSource[] {
    return sources
      .filter(Boolean)
      .map((url) => ({
        url,
        type: this.getImageType(url),
        priority: this.getImagePriority(url),
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the best image URL from multiple sources
   */
  static getBestImageUrl(sources: string[]): string | null {
    const prioritized = this.prioritizeImageSources(sources);
    if (prioritized.length === 0) return null;

    const bestSource = prioritized[0];

    // Convert IPFS URLs to HTTPS gateways for CSP compliance
    if (bestSource.type === 'ipfs') {
      return this.convertIPFStoHTTPS(bestSource.url);
    }

    return bestSource.url;
  }

  /**
   * Convert IPFS URLs to HTTPS gateway URLs
   */
  static convertIPFStoHTTPS(ipfsUrl: string): string {
    if (!ipfsUrl.startsWith('ipfs://')) {
      return ipfsUrl;
    }

    const hash = ipfsUrl.replace('ipfs://', '');
    // Use the first gateway as default
    return `${this.ipfsGateways[0]}${hash}`;
  }

  /**
   * Get multiple IPFS gateway URLs for fallback
   */
  static getIPFSFallbacks(ipfsUrl: string): string[] {
    if (!ipfsUrl.startsWith('ipfs://')) {
      return [ipfsUrl];
    }

    const hash = ipfsUrl.replace('ipfs://', '');
    return this.ipfsGateways.map((gateway) => `${gateway}${hash}`);
  }

  /**
   * Determine image type
   */
  private static getImageType(url: string): ImageSource['type'] {
    if (url.startsWith('ipfs://')) return 'ipfs';
    if (
      url.includes('supabase') ||
      url.includes('localhost') ||
      url.includes('spiritdao.org')
    )
      return 'local';
    return 'external';
  }

  /**
   * Assign priority (lower = higher priority)
   */
  private static getImagePriority(url: string): number {
    const type = this.getImageType(url);

    switch (type) {
      case 'local':
        return 1;
      case 'external':
        return 2;
      case 'ipfs':
        return 3;
      default:
        return 4;
    }
  }

  /**
   * Validate if image URL is accessible
   */
  static async validateImageUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return (
        response.ok &&
        (response.headers.get('content-type')?.startsWith('image/') ?? false)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get pod image with fallback priority
   */
  static getPodImageUrl(pod: any): string {
    const sources = [
      pod.pod_image_url, // Local database image (highest priority)
      pod.image_url, // Alternative local field
      pod.imageURI, // HAT protocol image
      pod.image, // Generic image field
    ].filter(Boolean);

    const bestUrl = this.getBestImageUrl(sources);

    // Fallback to generated avatar if no images available
    if (!bestUrl) {
      const podName = pod.name || 'Pod';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(podName)}&size=400&background=bfe7c6&color=000&bold=true`;
    }

    return bestUrl;
  }

  /**
   * Get HAT image with fallback priority
   */
  static getHatImageUrl(hatDetails: any, hatId?: string): string {
    const sources = [
      hatDetails?.localImageUrl, // Local stored image (highest priority)
      hatDetails?.imageURL, // Alternative field
      hatDetails?.imageURI, // Standard HAT field
      hatDetails?.image, // Generic field
    ].filter(Boolean);

    const bestUrl = this.getBestImageUrl(sources);

    // Fallback to generated avatar
    if (!bestUrl) {
      const hatName = hatDetails?.details || hatDetails?.name || 'HAT';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(hatName)}&size=400&background=6366f1&color=fff&bold=true`;
    }

    return bestUrl;
  }

  /**
   * Upload image to Supabase and return public URL
   */
  static async uploadImage(
    file: File,
    bucket: string,
    path: string,
  ): Promise<string> {
    try {
      // Upload file to Supabase storage
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw error;
    }
  }

  /**
   * Create fallback image component props with error handling
   */
  static createImageProps(
    sources: string[],
    altText: string,
    fallbackName: string,
  ) {
    const primaryUrl = this.getBestImageUrl(sources);
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&size=400&background=6366f1&color=fff&bold=true`;

    return {
      src: primaryUrl || fallbackUrl,
      alt: altText,
      onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== fallbackUrl) {
          console.warn(`Image failed to load: ${img.src}, using fallback`);
          img.src = fallbackUrl;
        }
      },
    };
  }
}

// Export convenience functions
export const getBestImageUrl = ImageService.getBestImageUrl.bind(ImageService);
export const getPodImageUrl = ImageService.getPodImageUrl.bind(ImageService);
export const getHatImageUrl = ImageService.getHatImageUrl.bind(ImageService);
export const convertIPFStoHTTPS =
  ImageService.convertIPFStoHTTPS.bind(ImageService);
export const createImageProps =
  ImageService.createImageProps.bind(ImageService);
