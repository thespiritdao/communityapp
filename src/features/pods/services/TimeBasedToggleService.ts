/**
 * TimeBasedToggleService
 *
 * Service for interacting with the TimeBasedToggleModule contract.
 * Enables on-chain, automatic time-based HAT expiration.
 *
 * Features:
 * - Set expiration timestamps for HATs
 * - Set start times for delayed activation
 * - Query current time window status
 * - Fully automated - no manual revocation needed
 *
 * Integration:
 * - Used during pod creation when time_based eligibility criteria exists
 * - Automatically sets toggle module on HAT creation
 * - Syncs time restrictions from criteria to on-chain toggle module
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import TimeBasedToggleModuleABI from '@/contracts/TimeBasedToggleModuleABI.json';

// Contract address - will be set after deployment
const TOGGLE_MODULE_ADDRESS = process.env
  .NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE as Address;

export interface HatTimeWindow {
  startTime: bigint;
  expiration: bigint;
  isActive: boolean;
  timeUntilExpiration: bigint;
}

export class TimeBasedToggleService {
  /**
   * Check if the toggle module is deployed and configured
   */
  static isConfigured(): boolean {
    return (
      !!TOGGLE_MODULE_ADDRESS &&
      TOGGLE_MODULE_ADDRESS !== '0x0000000000000000000000000000000000000000'
    );
  }

  /**
   * Get the toggle module address
   */
  static getModuleAddress(): Address | null {
    return this.isConfigured() ? TOGGLE_MODULE_ADDRESS : null;
  }

  /**
   * Set expiration time for a HAT
   * @param hatId The HAT ID to set expiration for
   * @param expirationTimestamp Unix timestamp when HAT should expire (0 = never)
   * @returns Transaction hash
   */
  static async setHatExpiration(
    hatId: bigint,
    expirationTimestamp: bigint,
  ): Promise<`0x${string}`> {
    if (!this.isConfigured()) {
      throw new Error(
        'TimeBasedToggleModule not configured. Deploy contract and set NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE',
      );
    }

    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Wallet not available');
    }

    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();

    console.log('⏰ Setting HAT expiration:', {
      hatId: hatId.toString(),
      expiration: new Date(Number(expirationTimestamp) * 1000).toISOString(),
      account,
    });

    const hash = await walletClient.writeContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'setHatExpiration',
      args: [hatId, expirationTimestamp],
      account,
    });

    console.log('✅ Expiration set! TX:', hash);
    return hash;
  }

  /**
   * Set start time for a HAT
   * @param hatId The HAT ID to set start time for
   * @param startTimestamp Unix timestamp when HAT should become active (0 = immediate)
   * @returns Transaction hash
   */
  static async setHatStartTime(
    hatId: bigint,
    startTimestamp: bigint,
  ): Promise<`0x${string}`> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Wallet not available');
    }

    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();

    console.log('🕐 Setting HAT start time:', {
      hatId: hatId.toString(),
      startTime:
        startTimestamp > 0n
          ? new Date(Number(startTimestamp) * 1000).toISOString()
          : 'Immediate',
      account,
    });

    const hash = await walletClient.writeContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'setHatStartTime',
      args: [hatId, startTimestamp],
      account,
    });

    console.log('✅ Start time set! TX:', hash);
    return hash;
  }

  /**
   * Set both start time and expiration in a single transaction
   * @param hatId The HAT ID
   * @param startTimestamp Unix timestamp when HAT becomes active (0 = immediate)
   * @param expirationTimestamp Unix timestamp when HAT expires (0 = never)
   * @returns Transaction hash
   */
  static async setHatTimeWindow(
    hatId: bigint,
    startTimestamp: bigint,
    expirationTimestamp: bigint,
  ): Promise<`0x${string}`> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Wallet not available');
    }

    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();

    console.log('📅 Setting HAT time window:', {
      hatId: hatId.toString(),
      startTime:
        startTimestamp > 0n
          ? new Date(Number(startTimestamp) * 1000).toISOString()
          : 'Immediate',
      expiration:
        expirationTimestamp > 0n
          ? new Date(Number(expirationTimestamp) * 1000).toISOString()
          : 'Never',
      account,
    });

    const hash = await walletClient.writeContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'setHatTimeWindow',
      args: [hatId, startTimestamp, expirationTimestamp],
      account,
    });

    console.log('✅ Time window set! TX:', hash);
    return hash;
  }

  /**
   * Get the time window for a HAT
   * @param hatId The HAT ID to query
   * @returns Time window information
   */
  static async getHatTimeWindow(hatId: bigint): Promise<HatTimeWindow> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const result = (await publicClient.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'getHatTimeWindow',
      args: [hatId],
    })) as [bigint, bigint, boolean, bigint];

    return {
      startTime: result[0],
      expiration: result[1],
      isActive: result[2],
      timeUntilExpiration: result[3],
    };
  }

  /**
   * Check if a HAT is currently active based on time
   * @param hatId The HAT ID to check
   * @returns True if HAT is within valid time window
   */
  static async getHatStatus(hatId: bigint): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const status = (await publicClient.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'getHatStatus',
      args: [hatId],
    })) as boolean;

    return status;
  }

  /**
   * Check if a HAT has expired
   * @param hatId The HAT ID to check
   * @returns True if HAT has expired
   */
  static async isHatExpired(hatId: bigint): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const expired = (await publicClient.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'isHatExpired',
      args: [hatId],
    })) as boolean;

    return expired;
  }

  /**
   * Check if a HAT has started (past start time)
   * @param hatId The HAT ID to check
   * @returns True if HAT is past start time or has no start time
   */
  static async isHatStarted(hatId: bigint): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('TimeBasedToggleModule not configured');
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const started = (await publicClient.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'isHatStarted',
      args: [hatId],
    })) as boolean;

    return started;
  }

  /**
   * Convert JavaScript Date to Unix timestamp (seconds)
   * @param date JavaScript Date object
   * @returns Unix timestamp in seconds as bigint
   */
  static dateToUnixTimestamp(date: Date): bigint {
    return BigInt(Math.floor(date.getTime() / 1000));
  }

  /**
   * Convert Unix timestamp to JavaScript Date
   * @param timestamp Unix timestamp in seconds
   * @returns JavaScript Date object
   */
  static unixTimestampToDate(timestamp: bigint): Date {
    return new Date(Number(timestamp) * 1000);
  }

  /**
   * Parse datetime-local input value to Unix timestamp
   * @param datetimeLocal String from datetime-local input (YYYY-MM-DDTHH:mm)
   * @returns Unix timestamp in seconds as bigint
   */
  static datetimeLocalToUnixTimestamp(datetimeLocal: string): bigint {
    if (!datetimeLocal) return 0n;
    const date = new Date(datetimeLocal);
    return this.dateToUnixTimestamp(date);
  }

  /**
   * Format Unix timestamp for display
   * @param timestamp Unix timestamp in seconds
   * @returns Formatted date string
   */
  static formatTimestamp(timestamp: bigint): string {
    if (timestamp === 0n) return 'Not set';
    const date = this.unixTimestampToDate(timestamp);
    return date.toLocaleString();
  }
}
