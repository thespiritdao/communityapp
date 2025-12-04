// src/services/walletVerificationService.ts

import type { Connector } from 'wagmi';

export interface WalletVerificationResult {
  isSmartWallet: boolean;
  detectedMethod: string;
  timestamp: number;
  address: string;
}

interface VerificationCache {
  [address: string]: {
    result: WalletVerificationResult;
    expiresAt: number;
  };
}

interface PendingVerification {
  [address: string]: Promise<WalletVerificationResult> | undefined;
}

class WalletVerificationService {
  private cache: VerificationCache = {};
  private pendingVerifications: PendingVerification = {};
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff
  private requestDedupeMap = new Map<string, Promise<any>>();

  /**
   * Get cached verification or perform new verification with deduplication
   */
  async verifyWallet(
    address: string,
    connector: Connector | undefined,
  ): Promise<WalletVerificationResult> {
    // Check cache first
    const cached = this.getCachedVerification(address);
    if (cached) {
      console.log('📦 Using cached wallet verification for:', address);
      return cached;
    }

    // Check if verification is already in progress (deduplication)
    if (this.pendingVerifications[address]) {
      console.log(
        '⏳ Waiting for existing verification to complete for:',
        address,
      );
      return this.pendingVerifications[address];
    }

    // Start new verification with deduplication
    console.log('🔍 Starting new wallet verification for:', address);
    this.pendingVerifications[address] = this.performVerificationWithRetry(
      address,
      connector,
    );

    try {
      const result = await this.pendingVerifications[address];

      // Cache the result
      this.cache[address] = {
        result,
        expiresAt: Date.now() + this.CACHE_DURATION,
      };

      return result;
    } finally {
      // Clean up pending verification
      delete this.pendingVerifications[address];
    }
  }

  /**
   * Perform wallet verification with retry logic
   */
  private async performVerificationWithRetry(
    address: string,
    connector: Connector | undefined,
    retryCount = 0,
  ): Promise<WalletVerificationResult> {
    try {
      return await this.performVerification(address, connector);
    } catch (error) {
      console.error(
        `❌ Wallet verification attempt ${retryCount + 1} failed:`,
        error,
      );

      if (retryCount < this.RETRY_DELAYS.length) {
        const delay = this.RETRY_DELAYS[retryCount];
        console.log(`🔄 Retrying wallet verification in ${delay}ms...`);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.performVerificationWithRetry(
          address,
          connector,
          retryCount + 1,
        );
      }

      // Max retries reached, return default result
      console.warn('⚠️ Max retries reached, defaulting to non-smart wallet');
      return {
        isSmartWallet: false,
        detectedMethod: 'Verification failed after retries',
        timestamp: Date.now(),
        address,
      };
    }
  }

  /**
   * Core verification logic
   */
  private async performVerification(
    address: string,
    connector: Connector | undefined,
  ): Promise<WalletVerificationResult> {
    if (!address || !connector) {
      return {
        isSmartWallet: false,
        detectedMethod: 'No address or connector',
        timestamp: Date.now(),
        address,
      };
    }

    const isCoinbaseConnector =
      connector.name === 'Coinbase Wallet' ||
      connector.id === 'coinbaseWallet' ||
      connector.id === 'coinbaseWalletSDK';

    if (!isCoinbaseConnector) {
      return {
        isSmartWallet: false,
        detectedMethod: 'Not a Coinbase connector',
        timestamp: Date.now(),
        address,
      };
    }

    // PERFORMANCE OPTIMIZATION: Check connector options FIRST (instant, no RPC calls)
    // Since we use preference: 'smartWalletOnly', this will always match
    if (connector.options) {
      if (
        (connector.options as any).preference === 'smartWalletOnly' ||
        (connector.options as any).enableSmartWallet === true
      ) {
        return {
          isSmartWallet: true,
          detectedMethod: 'Connector configured as smartWalletOnly',
          timestamp: Date.now(),
          address,
        };
      }
    }

    // Fallback to slower checks only if connector options don't indicate Smart Wallet
    // This code path should rarely execute given our smartWalletOnly config
    const provider = await this.getProviderWithDedup(connector, address);

    if (provider) {
      // Check contract code (slower, but more reliable)
      const hasContractCode = await this.checkContractCode(provider, address);
      if (hasContractCode) {
        return {
          isSmartWallet: true,
          detectedMethod: 'Contract code on address',
          timestamp: Date.now(),
          address,
        };
      }

      // Check provider properties
      const providerIndicates = this.checkProviderProperties(provider);
      if (providerIndicates !== null) {
        return {
          isSmartWallet: providerIndicates,
          detectedMethod: providerIndicates
            ? 'Provider indicates Smart Wallet'
            : 'Provider indicates NOT Smart Wallet',
          timestamp: Date.now(),
          address,
        };
      }
    }

    return {
      isSmartWallet: false,
      detectedMethod: 'No detection method matched',
      timestamp: Date.now(),
      address,
    };
  }

  /**
   * Get provider with request deduplication
   */
  private async getProviderWithDedup(
    connector: Connector,
    address: string,
  ): Promise<any> {
    const dedupeKey = `provider_${address}`;

    // Check if request is already in progress
    if (this.requestDedupeMap.has(dedupeKey)) {
      console.log('📦 Using deduplicated provider request');
      return this.requestDedupeMap.get(dedupeKey);
    }

    // Create new provider request
    const providerPromise = (async () => {
      try {
        if (typeof connector.getProvider === 'function') {
          return await connector.getProvider();
        }
        return connector.provider || null;
      } catch (error) {
        console.error('Failed to get provider:', error);
        return null;
      } finally {
        // Clean up dedupe map after a delay
        setTimeout(() => {
          this.requestDedupeMap.delete(dedupeKey);
        }, 1000);
      }
    })();

    this.requestDedupeMap.set(dedupeKey, providerPromise);
    return providerPromise;
  }

  /**
   * Check if address has contract code (Smart Wallet indicator)
   */
  private async checkContractCode(
    provider: any,
    address: string,
  ): Promise<boolean> {
    const dedupeKey = `code_${address}`;

    // Check if request is already in progress
    if (this.requestDedupeMap.has(dedupeKey)) {
      console.log('📦 Using deduplicated contract code request');
      return this.requestDedupeMap.get(dedupeKey);
    }

    const codePromise = (async () => {
      try {
        const code = await provider.request({
          method: 'eth_getCode',
          params: [address, 'latest'],
        });
        const hasCode = code && code !== '0x' && code !== '0x0';
        console.log('Contract code check:', { address, hasCode });
        return hasCode;
      } catch (error) {
        console.error('Contract code check failed:', error);
        return false;
      } finally {
        // Clean up dedupe map after a delay
        setTimeout(() => {
          this.requestDedupeMap.delete(dedupeKey);
        }, 1000);
      }
    })();

    this.requestDedupeMap.set(dedupeKey, codePromise);
    return codePromise;
  }

  /**
   * Check provider properties for Smart Wallet indicators
   */
  private checkProviderProperties(provider: any): boolean | null {
    if (!provider.isCoinbaseWallet) {
      return null;
    }

    console.log('Checking provider properties:', {
      isSmartWallet: provider.isSmartWallet,
      selectedProvider: provider.selectedProvider,
    });

    if (
      provider.isSmartWallet === true ||
      provider.selectedProvider === 'smartWallet'
    ) {
      return true;
    }

    if (
      provider.isSmartWallet === false ||
      provider.selectedProvider === 'extension' ||
      provider.selectedProvider === 'mobile' ||
      provider.qrUrl !== undefined
    ) {
      return false;
    }

    return null;
  }

  /**
   * Get cached verification result if valid
   */
  private getCachedVerification(
    address: string,
  ): WalletVerificationResult | null {
    const cached = this.cache[address];

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Clean up expired cache
    if (cached) {
      delete this.cache[address];
    }

    return null;
  }

  /**
   * Clear cache for specific address or all
   */
  clearCache(address?: string): void {
    if (address) {
      delete this.cache[address];
      console.log(`🧹 Cleared cache for address: ${address}`);
    } else {
      this.cache = {};
      console.log('🧹 Cleared all wallet verification cache');
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; addresses: string[] } {
    const addresses = Object.keys(this.cache);
    return {
      size: addresses.length,
      addresses,
    };
  }
}

// Export singleton instance
export const walletVerificationService = new WalletVerificationService();
