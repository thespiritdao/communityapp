'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import {
  PodTreasuryService,
  type TokenBalance,
  type TreasuryTransaction,
} from '../services/PodTreasuryService';

interface UsePodTreasuryResult {
  // Data state
  balances: TokenBalance[];
  transactions: TreasuryTransaction[];
  treasuryInfo: { address: string; supportedTokens: string[] } | null;

  // Loading states
  isLoading: boolean;
  isLoadingBalances: boolean;
  isLoadingTransactions: boolean;

  // Permission states
  canManageTreasury: boolean;
  isLoadingPermissions: boolean;

  // Error states
  error: string | null;

  // Actions
  loadTreasuryData: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  checkPermissions: () => Promise<void>;

  // Transaction preparation helpers
  prepareDistribution: (
    tokenAddress: string,
    recipients: string[],
    amounts: string[],
    reason: string,
  ) => any;
  prepareEqualDistribution: (
    tokenAddress: string,
    recipients: string[],
    totalAmount: string,
    reason: string,
  ) => any;
  prepareAddToken: (tokenAddress: string) => any;
  prepareSetAuthorizedProxy: (proxyAddress: string) => any;

  // Proxy transaction helpers (for sponsored transactions)
  prepareProxyDistribution: (
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipients: string[],
    amounts: string[],
    reason: string,
  ) => any;
  prepareProxyEqualDistribution: (
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipients: string[],
    totalAmount: string,
    reason: string,
  ) => any;
  prepareProxyEmergencyWithdraw: (
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipient: string,
    amount: string,
  ) => any;
}

/**
 * Comprehensive Treasury Management Hook
 *
 * Provides complete treasury functionality including:
 * - Real-time balance queries
 * - Transaction history from event logs
 * - Permission management via Hats Protocol
 * - Transaction preparation for OnChainKit
 * - Automatic data refresh and error handling
 */
export function usePodTreasury(
  treasuryAddress: string | undefined,
  podId?: string,
): UsePodTreasuryResult {
  const { address } = useAccount();

  // Data state
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [treasuryInfo, setTreasuryInfo] = useState<{
    address: string;
    supportedTokens: string[];
  } | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // Permission state
  const [canManageTreasury, setCanManageTreasury] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  /**
   * Load treasury balances
   */
  const refreshBalances = useCallback(async () => {
    if (!treasuryAddress || treasuryAddress === 'pending') {
      console.log('🏦 Treasury address is pending, skipping balance load');
      return;
    }

    setIsLoadingBalances(true);
    setError(null);

    try {
      console.log('🏦 Loading balances for treasury:', treasuryAddress);
      const newBalances =
        await PodTreasuryService.getTokenBalances(treasuryAddress);
      setBalances(newBalances);
      console.log('🏦 Balances loaded:', newBalances.length, 'tokens');
    } catch (err) {
      console.error('🏦 Failed to load balances:', err);
      setError(`Failed to load treasury balances: ${err}`);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [treasuryAddress]);

  /**
   * Load transaction history
   */
  const refreshTransactions = useCallback(async () => {
    if (!treasuryAddress || treasuryAddress === 'pending') {
      console.log('🏦 Treasury address is pending, skipping transaction load');
      return;
    }

    setIsLoadingTransactions(true);
    setError(null);

    try {
      if (podId) {
        console.log('🏦 Loading transaction history for pod:', podId);
        // Use Supabase for richer transaction history instead of blockchain parsing
        const newTransactions =
          await PodTreasuryService.getTransactionHistoryFromSupabase(podId);
        setTransactions(newTransactions);
        console.log(
          '🏦 Transaction history loaded:',
          newTransactions.length,
          'transactions',
        );
      } else {
        console.log(
          '🏦 Loading transaction history for treasury (fallback to blockchain):',
          treasuryAddress,
        );
        // Fallback to blockchain parsing when podId not available
        const newTransactions =
          await PodTreasuryService.getTransactionHistory(treasuryAddress);
        setTransactions(newTransactions);
        console.log(
          '🏦 Transaction history loaded:',
          newTransactions.length,
          'transactions',
        );
      }
    } catch (err) {
      console.error('🏦 Failed to load transaction history:', err);
      setError(`Failed to load transaction history: ${err}`);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [treasuryAddress, podId]);

  /**
   * Check user permissions
   */
  const checkPermissions = useCallback(async () => {
    if (!treasuryAddress || treasuryAddress === 'pending' || !address) {
      console.log('🏦 Treasury address is pending, skipping permission check');
      setCanManageTreasury(false);
      return;
    }

    setIsLoadingPermissions(true);

    try {
      console.log('🏦 Checking permissions for:', { treasuryAddress, address });
      const hasPermission = await PodTreasuryService.checkTreasuryPermissions(
        treasuryAddress,
        address,
      );
      setCanManageTreasury(hasPermission);
      console.log('🏦 Permission check result:', hasPermission);
    } catch (err) {
      console.error('🏦 Failed to check permissions:', err);
      setCanManageTreasury(false);
      setError(`Failed to check permissions: ${err}`);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [treasuryAddress, address]);

  /**
   * Load complete treasury data
   */
  const loadTreasuryData = useCallback(async () => {
    if (!treasuryAddress || treasuryAddress === 'pending') {
      console.log('🏦 Treasury address is pending, skipping full data load');
      setError(
        'Treasury deployment is pending. Please deploy the treasury first.',
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🏦 Loading complete treasury data for:', treasuryAddress);

      // Load treasury info
      const info = await PodTreasuryService.getTreasuryInfo(treasuryAddress);
      setTreasuryInfo(info);

      // Load all data in parallel
      await Promise.all([
        refreshBalances(),
        refreshTransactions(),
        checkPermissions(),
      ]);

      console.log('🏦 Treasury data loading complete');
    } catch (err) {
      console.error('🏦 Failed to load treasury data:', err);
      setError(`Failed to load treasury data: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [treasuryAddress, refreshBalances, refreshTransactions, checkPermissions]);

  /**
   * Transaction preparation helpers
   */
  const prepareDistribution = useCallback(
    (
      tokenAddress: string,
      recipients: string[],
      amounts: string[],
      reason: string,
    ) => {
      if (!treasuryAddress) throw new Error('Treasury address not available');

      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareDistributionTransaction(
        treasuryAddress,
        tokenAddress,
        recipients,
        amounts,
        token.decimals,
        reason,
      );
    },
    [treasuryAddress, balances],
  );

  const prepareEqualDistribution = useCallback(
    (
      tokenAddress: string,
      recipients: string[],
      totalAmount: string,
      reason: string,
    ) => {
      if (!treasuryAddress) throw new Error('Treasury address not available');

      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareEqualDistributionTransaction(
        treasuryAddress,
        tokenAddress,
        recipients,
        totalAmount,
        token.decimals,
        reason,
      );
    },
    [treasuryAddress, balances],
  );

  const prepareAddToken = useCallback(
    (tokenAddress: string) => {
      if (!treasuryAddress) throw new Error('Treasury address not available');

      return PodTreasuryService.prepareAddTokenTransaction(
        treasuryAddress,
        tokenAddress,
      );
    },
    [treasuryAddress],
  );

  const prepareSetAuthorizedProxy = useCallback(
    (proxyAddress: string) => {
      if (!treasuryAddress) throw new Error('Treasury address not available');

      return PodTreasuryService.prepareSetAuthorizedProxyTransaction(
        treasuryAddress,
        proxyAddress,
      );
    },
    [treasuryAddress],
  );

  /**
   * PROXY TRANSACTION HELPERS - Use these for sponsored transactions
   */
  const prepareProxyDistribution = useCallback(
    (
      proxyAddress: string,
      podId: string,
      tokenAddress: string,
      recipients: string[],
      amounts: string[],
      reason: string,
    ) => {
      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareProxyDistributionTransaction(
        proxyAddress,
        podId,
        tokenAddress,
        recipients,
        amounts,
        token.decimals,
        reason,
      );
    },
    [balances],
  );

  const prepareProxyEqualDistribution = useCallback(
    (
      proxyAddress: string,
      podId: string,
      tokenAddress: string,
      recipients: string[],
      totalAmount: string,
      reason: string,
    ) => {
      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareProxyEqualDistributionTransaction(
        proxyAddress,
        podId,
        tokenAddress,
        recipients,
        totalAmount,
        token.decimals,
        reason,
      );
    },
    [balances],
  );

  const prepareProxyDistributeSingle = useCallback(
    (
      proxyAddress: string,
      podId: string,
      tokenAddress: string,
      recipient: string,
      amount: string,
      reason: string,
    ) => {
      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareProxyDistributeSingleTransaction(
        proxyAddress,
        podId,
        tokenAddress,
        recipient,
        amount,
        token.decimals,
        reason,
      );
    },
    [balances],
  );

  const prepareProxyEmergencyWithdraw = useCallback(
    (
      proxyAddress: string,
      podId: string,
      tokenAddress: string,
      recipient: string,
      amount: string,
    ) => {
      // Find token to get decimals
      const token = balances.find(
        (b) => b.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (!token) throw new Error('Token not found in balances');

      return PodTreasuryService.prepareProxyEmergencyWithdraw(
        proxyAddress,
        podId,
        tokenAddress,
        recipient,
        amount,
        token.decimals,
      );
    },
    [balances],
  );

  // Load initial data when treasury address changes
  useEffect(() => {
    if (treasuryAddress) {
      loadTreasuryData();
    } else {
      // Reset state if no treasury address
      setBalances([]);
      setTransactions([]);
      setTreasuryInfo(null);
      setCanManageTreasury(false);
      setError(null);
    }
  }, [treasuryAddress, loadTreasuryData]);

  // Check permissions when address changes
  useEffect(() => {
    checkPermissions();
  }, [address, checkPermissions]);

  return {
    // Data
    balances,
    transactions,
    treasuryInfo,

    // Loading states
    isLoading,
    isLoadingBalances,
    isLoadingTransactions,

    // Permissions
    canManageTreasury,
    isLoadingPermissions,

    // Error state
    error,

    // Actions
    loadTreasuryData,
    refreshBalances,
    refreshTransactions,
    checkPermissions,

    // Transaction helpers
    prepareDistribution,
    prepareEqualDistribution,
    prepareAddToken,
    prepareSetAuthorizedProxy,

    // Proxy transaction helpers (for sponsored transactions)
    prepareProxyDistribution,
    prepareProxyDistributeSingle,
    prepareProxyEqualDistribution,
    prepareProxyEmergencyWithdraw,
  };
}
