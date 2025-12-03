'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useOnchainKit } from '@coinbase/onchainkit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { usePodTreasury } from '../hooks/usePodTreasury';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import {
  Send,
  TrendingUp,
  History,
  Plus,
  AlertTriangle,
  Wallet,
  Shield,
  Copy,
  ExternalLink,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  Clock,
  Circle,
  User,
} from 'lucide-react';
import UserRecipientSelector from './UserRecipientSelector';
import { getTreasuryAddress } from '../utils/treasuryAddressUtils';
import { debugTreasuryHatMismatch } from '../utils/debugTreasuryHatMismatch';
import {
  prepareDirectDistribution,
  prepareDirectEqualDistribution,
} from './DirectDistribution';
import ConsolidatedTreasuryDeployer from './ConsolidatedTreasuryDeployer';

// Treasury Proxy address from environment
const TREASURY_PROXY_ADDRESS = process.env
  .NEXT_PUBLIC_TREASURY_PROXY as `0x${string}`;
const proxyMissing = !TREASURY_PROXY_ADDRESS;

interface TreasuryManagementProps {
  podId: string;
  treasuryAddress?: string;
  podName: string;
}

/**
 * 🏦 Treasury Management Component - Enhanced
 *
 * Provides comprehensive treasury management for pod leaders including:
 * - View treasury balances across multiple tokens
 * - Distribute funds to members (single and batch)
 * - Transaction history and monitoring
 * - Multi-signature support (configured for testing: 1 signer required)
 * - Emergency controls for authorized managers
 * - User-friendly recipient selection with name lookup
 */
export function TreasuryManagement({
  podId,
  treasuryAddress: fallbackTreasuryAddress,
  podName,
}: TreasuryManagementProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const { config } = useOnchainKit();
  const { selectedUser, users, isOpen, openProfileModal, closeProfileModal } =
    useProfileModal();

  // Factory-first treasury address resolution
  const [resolvedTreasuryAddress, setResolvedTreasuryAddress] = useState<
    string | null
  >(null);
  const [treasuryAddressLoading, setTreasuryAddressLoading] = useState(true);

  // Resolve treasury address from factory on component mount
  useEffect(() => {
    const resolveTreasuryAddress = async () => {
      try {
        setTreasuryAddressLoading(true);
        const factoryAddress = await getTreasuryAddress(
          podId,
          fallbackTreasuryAddress,
        );
        setResolvedTreasuryAddress(factoryAddress);
        console.log(
          '🏦 Treasury address resolved for management:',
          factoryAddress,
        );
      } catch (error) {
        console.error('🏦 Failed to resolve treasury address:', error);
        setResolvedTreasuryAddress(fallbackTreasuryAddress || null);
      } finally {
        setTreasuryAddressLoading(false);
      }
    };

    if (podId) {
      resolveTreasuryAddress();
    }
  }, [podId, fallbackTreasuryAddress]);

  // Use resolved address for treasury operations
  const treasuryAddress = resolvedTreasuryAddress;

  // Use our new treasury hook for real Web3 integration
  const {
    balances,
    transactions,
    treasuryInfo,
    isLoading,
    isLoadingBalances,
    isLoadingTransactions,
    canManageTreasury,
    isLoadingPermissions,
    error,
    loadTreasuryData,
    refreshBalances,
    refreshTransactions,
    prepareDistribution,
    prepareEqualDistribution,
    prepareAddToken,
    prepareProxyDistribution,
    prepareProxyEqualDistribution,
  } = usePodTreasury(treasuryAddress ?? undefined, podId);

  // UI State management
  const [activeTab, setActiveTab] = useState<
    'overview' | 'distribute' | 'history' | 'settings'
  >('overview');

  // Direct mode toggle (to bypass proxy tx.origin issue)

  // Distribution form state
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [distributionType, setDistributionType] = useState<
    'single' | 'batch' | 'equal'
  >('single');
  const [recipients, setRecipients] = useState<
    { address: string; name: string; amount: string }[]
  >([{ address: '', name: '', amount: '' }]);
  const [totalAmount, setTotalAmount] = useState('');
  const [reason, setReason] = useState('');
  const [newTokenAddress, setNewTokenAddress] = useState('');

  // Track pending transaction for status updates
  const [pendingTransactionId, setPendingTransactionId] = useState<
    string | null
  >(null);

  // Listen for treasury funding events from funding modal
  useEffect(() => {
    const handleTreasuryUpdate = (event: CustomEvent) => {
      const { recipientAddress, podId: eventPodId, isTreasury } = event.detail;

      // Check if this treasury should refresh:
      // 1. Direct match: funding was sent directly to this treasury address
      // 2. Pod match: funding was sent via proxy to this pod's treasury
      const shouldRefresh =
        recipientAddress?.toLowerCase() === treasuryAddress?.toLowerCase() ||
        (isTreasury && eventPodId === podId);

      if (shouldRefresh) {
        console.log('🏦 Treasury funding detected, refreshing balances...', {
          recipientAddress,
          treasuryAddress,
          eventPodId,
          podId,
          isTreasury,
        });

        // Add a small delay to ensure blockchain state is updated
        setTimeout(() => {
          refreshBalances();
          refreshTransactions();
        }, 2000);
      }
    };

    window.addEventListener(
      'treasuryUpdated',
      handleTreasuryUpdate as EventListener,
    );
    return () => {
      window.removeEventListener(
        'treasuryUpdated',
        handleTreasuryUpdate as EventListener,
      );
    };
  }, [treasuryAddress, podId, refreshBalances, refreshTransactions]);

  /**
   * Store transaction metadata before initiating
   */
  const storeTransactionMetadata = async () => {
    if (!selectedToken || !podId || !treasuryAddress) {
      console.error('💾 Missing required data for storing transaction');
      return null;
    }

    try {
      // Get token info
      const tokenInfo = balances.find((t) => t.address === selectedToken);
      if (!tokenInfo) {
        console.error('💾 Token info not found');
        return null;
      }

      // Calculate total amount for the transaction
      let totalTransactionAmount = '0';
      let recipientAddresses: string[] = [];

      if (distributionType === 'equal') {
        totalTransactionAmount = totalAmount;
        recipientAddresses = recipients
          .filter((r) => r.address)
          .map((r) => r.address);
      } else {
        const validRecipients = recipients.filter((r) => r.address && r.amount);
        totalTransactionAmount = validRecipients.reduce((sum, r) => {
          return (
            Number.parseFloat(sum) + Number.parseFloat(r.amount || '0')
          ).toString();
        }, '0');
        recipientAddresses = validRecipients.map((r) => r.address);
      }

      // Import the service
      const { PodTreasuryService } = await import(
        '../services/PodTreasuryService'
      );

      // Store transaction metadata
      const transactionId = await PodTreasuryService.storeTransactionMetadata(
        podId,
        treasuryAddress,
        'distribution',
        selectedToken,
        tokenInfo.symbol,
        tokenInfo.decimals,
        totalTransactionAmount,
        `${totalTransactionAmount} ${tokenInfo.symbol}`,
        address, // sender is current user
        recipientAddresses.length === 1 ? recipientAddresses[0] : undefined, // single recipient
        reason || 'Treasury distribution',
        undefined, // sender name - could be fetched from user profile
        recipientAddresses.length === 1 ? recipients[0]?.name : undefined, // recipient name if single
      );

      console.log('💾 Transaction metadata stored with ID:', transactionId);
      setPendingTransactionId(transactionId);
      return transactionId;
    } catch (error) {
      console.error('💾 Failed to store transaction metadata:', error);
      // Continue without storing - don't block the transaction
      return null;
    }
  };

  // Track if we've already stored metadata for current transaction
  const [isMetadataStored, setIsMetadataStored] = useState(false);

  /**
   * Prepare transaction calls for distribution (synchronous to match working patterns)
   */
  const prepareTransactionCalls = () => {
    if (!selectedToken || !reason || recipients.length === 0) {
      throw new Error('Missing required fields');
    }

    const validRecipients = recipients.filter(
      (r) => r.address && r.address.trim(),
    );
    if (validRecipients.length === 0) {
      throw new Error('No valid recipients provided');
    }

    try {
      let calls;

      // Get token decimals for amount conversion
      const selectedTokenData = balances.find(
        (t) => t.address === selectedToken,
      );
      const decimals = selectedTokenData?.decimals || 18;

      // IMPORTANT: Always use proxy for scalable sponsorship
      if (treasuryAddress && TREASURY_PROXY_ADDRESS) {
        // Use Treasury Proxy for sponsored transactions (Coinbase Smart Wallet compatible)
        console.log('🔄 Using Treasury Proxy for sponsored distribution:', {
          proxyAddress: TREASURY_PROXY_ADDRESS,
          treasuryAddress,
          podId,
          proxyFromEnv: process.env.NEXT_PUBLIC_TREASURY_PROXY,
          paymasterUrl: config?.paymaster,
        });

        // Additional sponsorship debug
        console.log('💰 Sponsorship Configuration:', {
          isSponsored: true,
          chainId: 8453,
          account: address,
        });

        if (distributionType === 'equal' && totalAmount) {
          calls = [
            prepareProxyEqualDistribution(
              TREASURY_PROXY_ADDRESS,
              podId,
              selectedToken,
              validRecipients.map((r) => r.address),
              totalAmount,
              reason,
            ),
          ];
        } else {
          const addresses = validRecipients.map((r) => r.address);
          const amounts = validRecipients.map((r) => r.amount || '0');

          // Validate amounts
          const invalidAmounts = amounts.filter(
            (amount) => !amount || Number.parseFloat(amount) <= 0,
          );
          if (invalidAmounts.length > 0) {
            throw new Error('All recipient amounts must be greater than 0');
          }

          // Use prepareProxyDistribution for both single and multiple recipients
          console.log('🎯 Using proxy distribution:', {
            method: 'prepareProxyDistribution',
            recipients: validRecipients.length,
            selectedToken,
          });
          calls = [
            prepareProxyDistribution(
              TREASURY_PROXY_ADDRESS,
              podId,
              selectedToken,
              addresses,
              amounts,
              reason,
            ),
          ];
        }
      } else if (treasuryAddress) {
        // Fallback to direct treasury calls if proxy not available
        console.log(
          '⚠️  No Treasury Proxy - using direct calls (will not be sponsored)',
        );
        console.log('📍 Direct treasury address:', treasuryAddress);

        if (distributionType === 'equal' && totalAmount) {
          calls = [
            prepareDirectEqualDistribution(
              treasuryAddress,
              selectedToken,
              validRecipients.map((r) => r.address),
              totalAmount,
              decimals,
              reason,
            ),
          ];
        } else {
          const addresses = validRecipients.map((r) => r.address);
          const amounts = validRecipients.map((r) => r.amount || '0');

          // Validate amounts
          const invalidAmounts = amounts.filter(
            (amount) => !amount || Number.parseFloat(amount) <= 0,
          );
          if (invalidAmounts.length > 0) {
            throw new Error('All recipient amounts must be greater than 0');
          }

          calls = [
            prepareDirectDistribution(
              treasuryAddress,
              selectedToken,
              addresses,
              amounts,
              decimals,
              reason,
            ),
          ];
        }
      }

      // Get token info for debugging
      const debugTokenInfo = balances.find((t) => t.address === selectedToken);
      console.log('🏦 Transaction calls prepared:', {
        treasuryAddress,
        selectedToken,
        selectedTokenName: debugTokenInfo?.symbol,
        availableBalance: debugTokenInfo?.balance,
        distributionType,
        validRecipients: validRecipients.length,
        recipients: validRecipients.map((r) => ({
          address: r.address,
          amount: r.amount,
        })),
        totalAmount: distributionType === 'equal' ? totalAmount : 'individual',
        calls,
      });

      // Debug HAT permissions before transaction (async debug moved to separate effect)
      console.log('🎩 HAT permissions should be validated separately');

      // TODO: Move HAT debug to useEffect or separate async function
      // if (address) {
      //   debugTreasuryHatMismatch(address, podId).then(debugResult => {
      //     console.log('🎩 HAT Debug result:', debugResult);
      //   }).catch(console.warn);
      // }

      return calls;
    } catch (error) {
      console.error('🏦 Error preparing distribution transaction:', error);
      throw error;
    }
  };

  /**
   * Handle successful distribution
   */
  const handleDistributionSuccess = async (response: any) => {
    console.log('🏦 Distribution successful:', response);

    // Update transaction status in Supabase
    if (pendingTransactionId) {
      try {
        const { PodTreasuryService } = await import(
          '../services/PodTreasuryService'
        );
        // Extract transaction hash from response if available
        const txHash =
          response?.transactionHash || response?.hash || response?.txHash;
        await PodTreasuryService.updateTransactionStatus(
          pendingTransactionId,
          'completed',
          txHash,
        );
        console.log('💾 Transaction status updated to completed');
      } catch (error) {
        console.error('💾 Failed to update transaction status:', error);
      }
    }

    toast({
      title: 'Distribution Successful!',
      description: `Funds distributed to ${recipients.filter((r) => r.address).length} recipient(s)`,
    });

    // Reset form
    setRecipients([{ address: '', name: '', amount: '' }]);
    setTotalAmount('');
    setReason('');
    setSelectedToken('');
    setPendingTransactionId(null);
    setIsMetadataStored(false);

    // Refresh treasury data
    await refreshBalances();
    await refreshTransactions();
  };

  /**
   * Handle distribution error
   */
  const handleDistributionError = async (error: any) => {
    console.error('🏦 Distribution failed:', error);
    console.error('🏦 Full error details:', {
      message: error?.message,
      code: error?.code,
      data: error?.data,
      cause: error?.cause,
      stack: error?.stack,
    });

    // Update transaction status in Supabase
    if (pendingTransactionId) {
      try {
        const { PodTreasuryService } = await import(
          '../services/PodTreasuryService'
        );
        await PodTreasuryService.updateTransactionStatus(
          pendingTransactionId,
          'failed',
        );
        console.log('💾 Transaction status updated to failed');
      } catch (updateError) {
        console.error('💾 Failed to update transaction status:', updateError);
      }
    }

    // Try to extract more specific error info
    let errorMessage = 'Failed to distribute funds. Please try again.';
    if (error?.message?.includes('Insufficient balance')) {
      errorMessage =
        'Treasury has insufficient token balance for this distribution.';
    } else if (error?.message?.includes('execution reverted')) {
      errorMessage =
        'Transaction reverted. Check treasury contract permissions.';
    } else if (error?.code === 'ACTION_REJECTED') {
      errorMessage = 'Transaction was rejected by user.';
    }

    toast({
      title: 'Distribution Failed',
      description: errorMessage,
      variant: 'destructive',
    });

    // Reset pending transaction
    setPendingTransactionId(null);
    setIsMetadataStored(false);
  };

  /**
   * Handle add token success
   */
  const handleAddTokenSuccess = async (response: any) => {
    console.log('🏦 Token added successfully:', response);

    toast({
      title: 'Token Added!',
      description: 'Token has been added to treasury supported tokens',
    });

    setNewTokenAddress('');
    await loadTreasuryData();
  };

  /**
   * Handle add token error
   */
  const handleAddTokenError = (error: any) => {
    console.error('🏦 Add token failed:', error);
    toast({
      title: 'Failed to Add Token',
      description: error.message || 'Failed to add token. Please try again.',
      variant: 'destructive',
    });
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast({
      title: 'Copied',
      description: 'Address copied to clipboard',
    });
  };

  // Show loading state (include treasury address loading)
  if (isLoading || isLoadingPermissions || treasuryAddressLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"
            style={{ borderColor: '#2F5D50' }}
          ></div>
          <p className="text-gray-600">
            {treasuryAddressLoading
              ? 'Resolving treasury address...'
              : 'Loading treasury data...'}
          </p>
        </div>
      </div>
    );
  }

  // Show setup required if no treasury address or treasury is pending
  // Check this BEFORE access control, as deployment might be needed first
  if (
    !treasuryAddress ||
    treasuryAddress === 'pending' ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Treasury Not Deployed
              </h3>
              <p className="text-gray-600 mb-4">
                This pod doesn't have a treasury contract deployed yet. Deploy
                one to start managing funds.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Treasury Deployment UI */}
        <Card>
          <CardHeader>
            <CardTitle>Deploy Treasury Contract</CardTitle>
            <p className="text-sm text-gray-600">
              Deploy a smart contract treasury to manage {podName}'s funds
              on-chain.
            </p>
          </CardHeader>
          <CardContent>
            <ConsolidatedTreasuryDeployer podId={podId} podName={podName} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state (but not for "pending" deployment errors - those are handled above)
  const isPendingError =
    error?.includes('pending') || error?.includes('deploy the treasury first');
  if (error && !isPendingError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <AlertTriangle
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: '#8B3A3A' }}
            />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Error Loading Treasury
            </h3>
            <p className="mb-4" style={{ color: '#8B3A3A' }}>
              {error}
            </p>
            <Button onClick={loadTreasuryData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show access denied if user doesn't have permissions (only checked if treasury exists)
  if (!canManageTreasury) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Access Restricted
            </h3>
            <p className="text-gray-600 mb-4">
              Treasury management is restricted to pod leaders and authorized
              managers.
            </p>
            <Badge variant="outline">
              Requires: Treasury Management Permission
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalValueUSD = balances.reduce(
    (sum, token) => sum + (token.valueUSD || 0),
    0,
  );

  return (
    <div className="space-y-6 bottom-nav-spacing">
      {/* Treasury Overview Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Treasury Overview</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Manage pod funds and distribute tokens.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                ${totalValueUSD.toFixed(2)}
              </div>
              <p className="text-sm text-gray-600">Total</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Contract:</span>
            <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
              {treasuryAddress.slice(0, 8)}...{treasuryAddress.slice(-6)}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyAddress(treasuryAddress)}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                window.open(
                  `https://basescan.org/address/${treasuryAddress}`,
                  '_blank',
                )
              }
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <Card>
        <CardHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-2">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'distribute', label: 'Distribute', icon: Send },
              { id: 'history', label: 'History', icon: History },
              { id: 'settings', label: 'Settings', icon: Shield },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(tab.id as any)}
                className="w-full justify-start"
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Token Balances</h3>
              <div className="grid gap-4">
                {balances.map((token) => {
                  const isSelf =
                    token.symbol === '$SELF' || token.symbol === 'SELF';
                  const isSystem =
                    token.symbol === 'SYSTEM' || token.symbol === '$SYSTEM';

                  return (
                    <div
                      key={token.address}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <div className="inline-flex items-center gap-2">
                          {isSelf && (
                            <img
                              src="/images/erc20tokens/SelfToken.png"
                              alt="$SELF"
                              className="w-5 h-5 rounded"
                            />
                          )}
                          {isSystem && (
                            <img
                              src="/images/erc20tokens/SystemToken.png"
                              alt="SYSTEM"
                              className="w-5 h-5 rounded"
                            />
                          )}
                          <span className="font-semibold">{token.symbol}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold tabular-nums">
                          {Number(token.balance).toFixed(4)}
                        </div>
                        {token.valueUSD && (
                          <div className="text-sm text-gray-600">
                            ${token.valueUSD.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distribute Tab */}
          {activeTab === 'distribute' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Distribute Funds</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshBalances}
                  disabled={isLoadingBalances}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isLoadingBalances ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>

              {/* Distribution Type */}
              <div className="space-y-2">
                <Label>Distribution Type</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'single', label: 'Single Recipient' },
                    { id: 'batch', label: 'Multiple Recipients' },
                    { id: 'equal', label: 'Equal Distribution' },
                  ].map((type) => (
                    <Button
                      key={type.id}
                      variant={
                        distributionType === type.id ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() => setDistributionType(type.id as any)}
                      className="w-full"
                    >
                      {type.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Token Selection */}
              <div className="space-y-2">
                <Label htmlFor="token">Token</Label>
                <select
                  id="token"
                  className="w-full p-2 border rounded-md"
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  disabled={isLoadingBalances}
                >
                  <option value="">Select token...</option>
                  {balances.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.symbol} - {token.balance} available
                    </option>
                  ))}
                </select>
                {isLoadingBalances && (
                  <p className="text-sm text-gray-500">
                    Loading token balances...
                  </p>
                )}
              </div>

              {/* Recipients */}
              <div className="space-y-4">
                {distributionType === 'equal' && (
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">
                      Total Amount to Distribute
                    </Label>
                    <Input
                      id="totalAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={totalAmount}
                      onChange={(e) => {
                        let value = e.target.value;

                        // If user types ".00x" or similar, prepend "0" to make it "0.00x"
                        if (value.startsWith('.') && value.length > 1) {
                          value = '0' + value;
                        }

                        // Only allow valid number patterns or empty string
                        if (
                          value === '' ||
                          /^(\d*\.?\d*)$/.test(value) || // Valid decimal pattern
                          (Number.parseFloat(value) >= 0 &&
                            !isNaN(Number.parseFloat(value)))
                        ) {
                          setTotalAmount(value);
                        }
                        // If invalid input, don't update (keeps previous valid value)
                      }}
                    />
                  </div>
                )}

                <UserRecipientSelector
                  recipients={recipients}
                  onRecipientsChange={setRecipients}
                  distributionType={distributionType}
                />
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Required)</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Monthly contributor rewards, Event participation bonus..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {/* Transaction Section */}
              <div className="border-t pt-6 mt-6">
                {proxyMissing && (
                  <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
                    ⚠️ Sponsorship disabled: NEXT_PUBLIC_TREASURY_PROXY is not
                    set for this build. Distributions will use direct treasury
                    calls (unsponsored).
                  </div>
                )}
                <div className="bg-gray-50 p-4 rounded-lg">
                  {address &&
                  treasuryAddress &&
                  selectedToken &&
                  reason &&
                  recipients[0].address ? (
                    (() => {
                      // Calculate total amount needed
                      const tokenData = balances.find(
                        (t) => t.address === selectedToken,
                      );
                      let totalNeeded = '0';

                      try {
                        if (distributionType === 'equal' && totalAmount) {
                          totalNeeded = totalAmount;
                        } else {
                          const amounts = recipients
                            .filter((r) => r.address)
                            .map((r) => r.amount || '0');
                          totalNeeded = amounts.reduce(
                            (sum, amount) =>
                              (
                                Number.parseFloat(sum) +
                                Number.parseFloat(amount || '0')
                              ).toString(),
                            '0',
                          );
                        }

                        const hasInsufficientFunds =
                          tokenData &&
                          Number.parseFloat(totalNeeded) >
                            Number.parseFloat(tokenData.balance);

                        if (hasInsufficientFunds) {
                          return (
                            <div className="text-center py-6">
                              <AlertTriangle
                                className="h-12 w-12 mx-auto mb-3"
                                style={{ color: '#8B3A3A' }}
                              />
                              <h4
                                className="font-medium mb-2"
                                style={{ color: '#8B3A3A' }}
                              >
                                Insufficient Treasury Balance
                              </h4>
                              <p
                                className="text-sm mb-4"
                                style={{ color: '#8B3A3A' }}
                              >
                                Need {totalNeeded} {tokenData?.symbol} but
                                treasury only has {tokenData?.balance}{' '}
                                {tokenData?.symbol}
                              </p>
                              <p className="text-xs text-gray-500 mb-4">
                                Note: If tokens were sent directly to treasury
                                contract, they may need to be synced first.
                              </p>
                            </div>
                          );
                        }

                        // Only store metadata once when user starts the transaction
                        const handleDistribute = async () => {
                          if (!isMetadataStored) {
                            console.log(
                              '💾 Storing transaction metadata (once)...',
                            );
                            const txId = await storeTransactionMetadata();
                            if (txId) {
                              setIsMetadataStored(true);
                            }
                          }
                        };

                        return (
                          <div>
                            <Transaction
                              chainId={8453} // Base mainnet
                              calls={prepareTransactionCalls()}
                              isSponsored={true}
                              onSuccess={handleDistributionSuccess}
                              onError={handleDistributionError}
                            >
                              <div onClick={handleDistribute}>
                                <TransactionButton
                                  text={`Distribute ${distributionType === 'single' ? 'Funds' : distributionType === 'equal' ? 'Equal Amounts' : 'Batch Funds'}`}
                                  className="w-full h-12 text-white font-semibold rounded-lg flex items-center justify-center gap-2 bg-[#3F7A5A] hover:bg-[#2F5D50]"
                                />
                              </div>
                              <TransactionSponsor />
                              <TransactionStatus>
                                <TransactionStatusLabel />
                                <TransactionStatusAction />
                              </TransactionStatus>
                            </Transaction>
                          </div>
                        );
                      } catch (error) {
                        console.error(
                          '🏦 Error in transaction preparation:',
                          error,
                        );
                        return (
                          <div className="text-center py-6">
                            <AlertTriangle
                              className="h-12 w-12 mx-auto mb-3"
                              style={{ color: '#8B3A3A' }}
                            />
                            <h4
                              className="font-medium mb-2"
                              style={{ color: '#8B3A3A' }}
                            >
                              Transaction Error
                            </h4>
                            <p
                              className="text-sm mb-4"
                              style={{ color: '#8B3A3A' }}
                            >
                              {(error as any)?.message || 'An error occurred during transaction preparation'}
                            </p>
                          </div>
                        );
                      }
                    })()
                  ) : (
                    <div className="text-center py-6">
                      <Send className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <h4 className="font-medium text-gray-700 mb-2">
                        Ready to Distribute?
                      </h4>
                      <p className="text-sm text-gray-500 mb-4">
                        Complete all fields above to enable the distribution
                        transaction
                      </p>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div style={selectedToken ? { color: '#3F7A5A' } : {}}>
                          {selectedToken ? '✓' : '○'} Token selected
                        </div>
                        <div
                          style={
                            recipients[0]?.address ? { color: '#3F7A5A' } : {}
                          }
                        >
                          {recipients[0]?.address ? '✓' : '○'} Recipients added
                        </div>
                        <div style={reason.trim() ? { color: '#3F7A5A' } : {}}>
                          {reason.trim() ? '✓' : '○'} Reason provided
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Transaction History</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshTransactions}
                  disabled={isLoadingTransactions}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isLoadingTransactions ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>

              {isLoadingTransactions ? (
                <div className="text-center py-8">
                  <div
                    className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto mb-2"
                    style={{ borderColor: '#2F5D50' }}
                  ></div>
                  <p className="text-sm text-gray-500">
                    Loading transaction history...
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx) => {
                    // Get token info for proper display
                    const tokenInfo = balances.find(
                      (token) =>
                        token.address.toLowerCase() === tx.token?.toLowerCase(),
                    );
                    const tokenSymbol = tokenInfo?.symbol || 'Unknown';
                    const formattedAmount =
                      tx.amount && tokenInfo
                        ? `${Number.parseFloat(tx.amount).toFixed(4)} ${tokenSymbol}`
                        : `${tx.amount || '0'} ${tokenSymbol}`;

                    return (
                      <div
                        key={tx.id}
                        className="p-4 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-start justify-between">
                          {/* Left side - Transaction info */}
                          <div className="flex items-start space-x-3 flex-1">
                            {/* Transaction type icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {tx.type === 'deposit' && (
                                <ArrowDownCircle
                                  className="h-5 w-5"
                                  style={{ color: '#3F7A5A' }}
                                />
                              )}
                              {tx.type === 'distribution' && (
                                <Send
                                  className="h-5 w-5"
                                  style={{ color: '#2F5D50' }}
                                />
                              )}
                              {tx.type === 'withdrawal' && (
                                <ArrowUpCircle
                                  className="h-5 w-5"
                                  style={{ color: '#C6933F' }}
                                />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              {/* Amount and type */}
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-medium text-gray-900">
                                  {formattedAmount}
                                </span>
                                <Badge
                                  variant={
                                    tx.type === 'deposit'
                                      ? 'default'
                                      : tx.type === 'distribution'
                                        ? 'secondary'
                                        : 'outline'
                                  }
                                >
                                  {tx.type}
                                </Badge>
                              </div>

                              {/* Date */}
                              <div className="text-sm text-gray-600 mb-2">
                                {new Date(tx.timestamp).toLocaleDateString()} at{' '}
                                {new Date(tx.timestamp).toLocaleTimeString()}
                              </div>

                              {/* Reason */}
                              {tx.reason && (
                                <div
                                  className="text-sm mb-2"
                                  style={{ color: '#2F5D50' }}
                                >
                                  {tx.reason}
                                </div>
                              )}

                              {/* Recipients/Senders with profile modal integration */}
                              <div className="flex flex-wrap gap-2">
                                {tx.recipient && (
                                  <button
                                    onClick={() =>
                                      openProfileModal(tx.recipient!)
                                    }
                                    className="inline-flex items-center space-x-1 text-xs text-gray-600 px-2 py-1 rounded transition-colors"
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#2F5D50';
                                      e.currentTarget.style.backgroundColor =
                                        '#E8F1EE';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '';
                                      e.currentTarget.style.backgroundColor =
                                        '';
                                    }}
                                  >
                                    <User className="h-3 w-3" />
                                    <span>
                                      To: {tx.recipient.slice(0, 6)}...
                                      {tx.recipient.slice(-4)}
                                    </span>
                                  </button>
                                )}
                                {tx.sender && (
                                  <button
                                    onClick={() => openProfileModal(tx.sender!)}
                                    className="inline-flex items-center space-x-1 text-xs text-gray-600 px-2 py-1 rounded transition-colors"
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#2F5D50';
                                      e.currentTarget.style.backgroundColor =
                                        '#E8F1EE';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '';
                                      e.currentTarget.style.backgroundColor =
                                        '';
                                    }}
                                  >
                                    <User className="h-3 w-3" />
                                    <span>
                                      From: {tx.sender.slice(0, 6)}...
                                      {tx.sender.slice(-4)}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right side - Status and actions */}
                          <div className="flex flex-col items-end space-y-2 flex-shrink-0">
                            {/* Status with icon */}
                            <div className="flex items-center space-x-1">
                              {tx.status === 'completed' && (
                                <CheckCircle
                                  className="h-4 w-4"
                                  style={{ color: '#3F7A5A' }}
                                />
                              )}
                              {tx.status === 'pending' && (
                                <Clock
                                  className="h-4 w-4"
                                  style={{ color: '#C6933F' }}
                                />
                              )}
                              {tx.status === 'failed' && (
                                <Circle
                                  className="h-4 w-4"
                                  style={{ color: '#8B3A3A' }}
                                />
                              )}
                              <span className="text-sm font-medium capitalize">
                                {tx.status}
                              </span>
                            </div>

                            {/* Block explorer link */}
                            {tx.txHash && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  window.open(
                                    `https://basescan.org/tx/${tx.txHash}`,
                                    '_blank',
                                  )
                                }
                                className="h-8 w-8 p-0"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {transactions.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h4 className="font-medium mb-2">
                        No Transaction History
                      </h4>
                      <p className="text-sm">
                        Treasury transactions will appear here once funds are
                        distributed
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Treasury Settings</h3>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Treasury Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Contract Address:</span>
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                        {treasuryAddress?.slice(0, 8)}...
                        {treasuryAddress?.slice(-6)}
                      </code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Supported Tokens:</span>
                      <span>{treasuryInfo?.supportedTokens?.length || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Supported Tokens</h4>
                  <div className="space-y-2 mb-4">
                    {balances.map((token) => (
                      <div
                        key={token.address}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div>
                          <span className="font-medium">{token.symbol}</span>
                          <span className="text-sm text-gray-600 ml-2">
                            {token.name}
                          </span>
                        </div>
                      </div>
                    ))}
                    {balances.length === 0 && (
                      <p className="text-sm text-gray-500">
                        No supported tokens found
                      </p>
                    )}
                  </div>

                  {/* Add New Token */}
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Access Control</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Your Permission:</span>
                      <Badge
                        variant={canManageTreasury ? 'default' : 'destructive'}
                      >
                        {canManageTreasury ? 'Treasury Manager' : 'No Access'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      Treasury management requires the pod management HAT
                    </p>

                    {/* Always show debug button if user has address */}
                    {address && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              console.log('🔍 Debugging HAT permissions...');
                              const result = await debugTreasuryHatMismatch(
                                address,
                                podId,
                              );

                              // Also show result in toast for visibility
                              if (!result.hatsMatch) {
                                toast({
                                  title: 'HAT ID Mismatch Found!',
                                  description: `Treasury expects different HAT. Check console for details.`,
                                  variant: 'destructive',
                                });
                              } else if (result.userHasTreasuryHat) {
                                toast({
                                  title: 'HAT Permissions OK',
                                  description: `HATs match and you have required permissions.`,
                                });
                              } else {
                                toast({
                                  title: 'HAT Not Minted',
                                  description: `You need the management HAT minted to your address.`,
                                  variant: 'destructive',
                                });
                              }
                            } catch (error) {
                              console.error('Debug failed:', error);
                              toast({
                                title: 'Debug Failed',
                                description: 'Check console for error details',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          Debug HAT Permissions
                        </Button>
                        <p className="text-xs text-gray-400 mt-1">
                          Check why distribution transactions are failing
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Modal */}
      {selectedUser && (
        <ProfileModal
          user={selectedUser}
          users={users}
          onClose={closeProfileModal}
        />
      )}
    </div>
  );
}

// Export error-wrapped version for safer usage
import { withFeatureErrorBoundary } from '@/components/ErrorBoundary/FeatureErrorBoundary';
export const SafeTreasuryManagement = withFeatureErrorBoundary(
  TreasuryManagement,
  'Treasury Management',
  {
    showHomeLink: false, // Treasury is typically embedded in other views
  },
);
