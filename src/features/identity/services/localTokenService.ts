/**
 * Service for managing local token images and metadata
 * Uses database token_image field instead of fetching from external metadata URIs
 */

interface LocalTokenInfo {
  id: string;
  name: string;
  description: string;
  image: string;
  contract_address: string;
  token_type: string;
}

// Local token mapping based on your database
const LOCAL_TOKEN_MAPPING: Record<string, LocalTokenInfo> = {
  '$self': {
    id: '$self',
    name: '$SELF',
    description: "SpiritDAO's time-bound community currency.",
    image: '/images/erc20tokens/SelfToken.png',
    contract_address: '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21',
    token_type: 'erc20'
  },
  '$system': {
    id: '$system',
    name: '$SYSTEM',
    description: "SpiritDAO's fiat-bound community currency.",
    image: '/images/erc20tokens/SystemToken.png',
    contract_address: '0x1317Ae277266D38C4E492558f8693F14143a6A65',
    token_type: 'erc20'
  },
  'advocate': {
    id: 'advocate',
    name: 'Advocate',
    description: 'Verified SpiritDAO Member',
    image: '/images/members/advocatesquare500x.jpg',
    contract_address: '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d',
    token_type: 'erc721'
  },
  'poc': {
    id: 'poc',
    name: 'Proof of Curiosity',
    description: 'Access token for general community features',
    image: '/images/members/curioussquare500x.jpg',
    contract_address: '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
    token_type: 'erc721'
  },
  'executive pod': {
    id: 'executive_pod',
    name: 'Executive Pod',
    description: 'Executive Pod credential',
    image: '/images/pods/executivepod.png',
    contract_address: '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
    token_type: 'erc1155'
  },
  'dev pod': {
    id: 'dev_pod',
    name: 'Dev Pod',
    description: 'Development Pod credential',
    image: '/images/pods/devpod.png',
    contract_address: '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
    token_type: 'erc1155'
  }
};

// Pod image mapping
const POD_IMAGE_MAPPING: Record<string, string> = {
  'tophat': '/images/symbolobinfin.png',
  'community': '/images/pods/podmanager.png',
  'executive': '/images/pods/executivepod.png',
  'dev': '/images/pods/devpod.png',
  'development': '/images/pods/devpod.png'
};

export class LocalTokenService {
  /**
   * Get token information using local data instead of external metadata
   */
  static getTokenInfo(tokenLabel: string): LocalTokenInfo | null {
    const normalizedLabel = tokenLabel.toLowerCase();
    
    // Check direct mapping first
    if (LOCAL_TOKEN_MAPPING[normalizedLabel]) {
      return LOCAL_TOKEN_MAPPING[normalizedLabel];
    }
    
    // Check for partial matches (e.g., "Executive Pod" -> "executive")
    for (const [key, tokenInfo] of Object.entries(LOCAL_TOKEN_MAPPING)) {
      if (normalizedLabel.includes(key) || tokenInfo.name.toLowerCase().includes(normalizedLabel)) {
        return tokenInfo;
      }
    }
    
    return null;
  }
  
  /**
   * Get token image URL, prioritizing local images
   */
  static getTokenImage(tokenLabel: string, fallbackImage?: string): string {
    const tokenInfo = this.getTokenInfo(tokenLabel);
    
    if (tokenInfo?.image) {
      return tokenInfo.image;
    }
    
    // Check if fallback is an IPFS URL and replace with local
    if (fallbackImage && fallbackImage.startsWith('ipfs://')) {
      // Map common IPFS patterns to local images
      if (tokenLabel.toLowerCase().includes('executive')) {
        return '/images/pods/executivepod.png';
      }
      if (tokenLabel.toLowerCase().includes('dev') || tokenLabel.toLowerCase().includes('development')) {
        return '/images/pods/devpod.png';
      }
      if (tokenLabel.toLowerCase().includes('community')) {
        return '/images/pods/podmanager.png';
      }
      return '/images/symbolobinfin.png';
    }
    
    // Fallback for unknown tokens
    return fallbackImage || '/images/symbolobinfin.png';
  }
  
  /**
   * Get pod image based on pod type or name
   */
  static getPodImage(podType: string, podName?: string): string {
    const normalizedType = podType.toLowerCase();
    
    if (POD_IMAGE_MAPPING[normalizedType]) {
      return POD_IMAGE_MAPPING[normalizedType];
    }
    
    // Try to match by name
    if (podName) {
      const normalizedName = podName.toLowerCase();
      if (normalizedName.includes('executive')) {
        return '/images/pods/executivepod.png';
      }
      if (normalizedName.includes('community')) {
        return '/images/pods/podmanager.png';
      }
      if (normalizedName.includes('development') || normalizedName.includes('dev')) {
        return '/images/pods/devpod.png';
      }
      if (normalizedName.includes('top') || normalizedName.includes('root')) {
        return '/images/symbolobinfin.png';
      }
    }
    
    return '/images/symbolobinfin.png'; // Default fallback
  }
  
  /**
   * Check if a token should use local metadata instead of external fetching
   */
  static shouldUseLocalMetadata(tokenLabel: string): boolean {
    return this.getTokenInfo(tokenLabel) !== null;
  }
  
  /**
   * Get all available local tokens
   */
  static getAllLocalTokens(): LocalTokenInfo[] {
    return Object.values(LOCAL_TOKEN_MAPPING);
  }

  /**
   * Validate and sanitize image URL for Next.js Image component
   * Converts IPFS URLs to local images to prevent Next.js errors
   */
  static sanitizeImageUrl(imageUrl: string, tokenLabel?: string): string {
    if (!imageUrl) {
      return '/images/symbolobinfin.png';
    }

    // If it's an IPFS URL, replace with local image
    if (imageUrl.startsWith('ipfs://')) {
      
      return this.getTokenImage(tokenLabel || 'unknown', imageUrl);
    }

    // If it's a data URL or blob URL, replace with local image
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
      return this.getTokenImage(tokenLabel || 'unknown');
    }

    // Check if it's a valid HTTP/HTTPS URL
    try {
      const url = new URL(imageUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return imageUrl;
      }
    } catch (error) {
      // Invalid URL, use fallback
      return this.getTokenImage(tokenLabel || 'unknown');
    }

    // For relative paths, assume they're valid
    if (imageUrl.startsWith('/')) {
      return imageUrl;
    }

    // Default fallback
    return '/images/symbolobinfin.png';
  }
}

export default LocalTokenService;