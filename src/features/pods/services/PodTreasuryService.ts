'use client';

import { publicClient } from '@/config/wagmi.client';
import { formatUnits, parseUnits, getContract } from 'viem';
import TreasuryProxyABI from '../../../abis/TreasuryProxy.json';
import { supabase } from '@/utils/supabaseClient';

// PodTreasury contract ABI (from your PodTreasury.sol)
export const POD_TREASURY_ABI = [
  {
    name: 'receiveTokens',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'distributeTokens',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'distributeTokensEvenly',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getBalance',
    type: 'function',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getSupportedTokens',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    name: 'isPodManager',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'addSupportedToken',
    type: 'function',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'emergencyWithdraw',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    name: 'FundsReceived',
    type: 'event',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'from', type: 'address' },
    ],
  },
  {
    name: 'FundsDistributed',
    type: 'event',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address', indexed: true },
      { name: 'reason', type: 'string' },
    ],
  },
] as const;

// Treasury Proxy ABI for routing transactions through single whitelisted contract
// Use the official ABI from the compiled contract
export const TREASURY_PROXY_ABI = TreasuryProxyABI;

// ERC20 ABI (minimal for balance queries)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  valueUSD?: number;
}

export interface TreasuryTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'distribution';
  token: string;
  amount: string;
  recipient?: string;
  sender?: string;
  timestamp: Date;
  txHash: string;
  reason?: string;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * Web3 Treasury Service - Real contract integration
 *
 * Provides comprehensive treasury management functionality including:
 * - Token balance queries via multicall
 * - Transaction history from event logs
 * - Distribution transaction preparation
 * - Permission checks via Hats Protocol
 */
export class PodTreasuryService {
  /**
   * Get token balances for a treasury contract
   */
  static async getTokenBalances(
    treasuryAddress: string,
  ): Promise<TokenBalance[]> {
    try {
      console.log('🏦 Loading token balances for treasury:', treasuryAddress);

      // Use standard tokens from environment (CDP-compatible approach)
      // This replaces the old getSupportedTokens() pattern from Wagmi
      const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string;
      const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as string;

      const standardTokens = [SYSTEM_TOKEN, SELF_TOKEN].filter(
        (addr) => addr && addr !== '0x0000000000000000000000000000000000000000',
      );

      console.log('🏦 Standard tokens to check:', standardTokens);

      if (standardTokens.length === 0) {
        console.log('🏦 No standard tokens configured');
        return [];
      }

      // Query all token details and balances in parallel
      const tokenPromises = standardTokens.map(
        async (tokenAddress: string) => {
          try {
            const tokenContract = getContract({
              address: tokenAddress as `0x${string}`,
              abi: ERC20_ABI,
              client: publicClient,
            });

            // Get token metadata and treasury balance
            const [symbol, name, decimals, balance] = await Promise.all([
              tokenContract.read.symbol() as Promise<string>,
              tokenContract.read.name() as Promise<string>,
              tokenContract.read.decimals() as Promise<number>,
              tokenContract.read.balanceOf([
                treasuryAddress as `0x${string}`,
              ]) as Promise<bigint>,
            ]);

            console.log('🏦 Token balance query:', {
              token: tokenAddress,
              treasury: treasuryAddress,
              rawBalance: balance.toString(),
              decimals,
            });

            // Also check the treasury's internal accounting
            let internalBalance;
            try {
              const treasuryContract = getContract({
                address: treasuryAddress as `0x${string}`,
                abi: POD_TREASURY_ABI,
                client: publicClient,
              });

              internalBalance = (await treasuryContract.read.getBalance([
                tokenAddress as `0x${string}`,
              ])) as bigint;
              console.log('🏦 Treasury internal balance:', {
                token: tokenAddress,
                internalBalance: internalBalance.toString(),
                externalBalance: balance.toString(),
                match: internalBalance === balance,
              });

              // CRITICAL: If internal balance is 0 but external balance exists,
              // this means tokens were sent directly without using receiveTokens()
              if (internalBalance === 0n && balance > 0n) {
                console.error('🚨 BALANCE MISMATCH DETECTED:', {
                  issue:
                    'Tokens sent directly to contract without using receiveTokens()',
                  solution:
                    'Either use receiveTokens() or fix contract to use actual ERC20 balance',
                  externalBalance: balance.toString(),
                  internalBalance: internalBalance.toString(),
                });
              }
            } catch (err) {
              console.log('🏦 Could not read treasury internal balance:', err);
            }

            const formattedBalance = formatUnits(balance, decimals);

            return {
              address: tokenAddress,
              symbol,
              name,
              balance: formattedBalance,
              decimals,
              // TODO: Add price oracle integration for valueUSD
            };
          } catch (error) {
            console.error(
              '🏦 Error loading token details for:',
              tokenAddress,
              error,
            );
            return null;
          }
        },
      );

      const tokenResults = await Promise.all(tokenPromises);
      const validTokens = tokenResults.filter(
        (token): token is TokenBalance => token !== null,
      );

      console.log(
        '🏦 Loaded token balances:',
        validTokens.length,
        'tokens:',
        validTokens.map((t) => `${t.symbol}: ${t.balance}`),
      );
      return validTokens;
    } catch (error) {
      console.error('🏦 Error loading treasury balances:', error);
      throw new Error(`Failed to load treasury balances: ${error}`);
    }
  }

  /**
   * Store transaction metadata in Supabase for rich UX
   * Note: podId should be a valid UUID
   */
  static async storeTransactionMetadata(
    podId: string, // Should be UUID format
    treasuryAddress: string,
    type: 'deposit' | 'distribution' | 'withdrawal',
    tokenAddress: string,
    tokenSymbol: string,
    tokenDecimals: number,
    amountRaw: string,
    amountFormatted: string,
    senderAddress?: string,
    recipientAddress?: string,
    reason?: string,
    senderName?: string,
    recipientName?: string,
  ): Promise<string> {
    try {
      console.log('💾 Attempting to insert transaction record:', {
        pod_id: podId,
        treasury_address: treasuryAddress,
        type,
        token_address: tokenAddress,
        token_symbol: tokenSymbol,
        amount_formatted: amountFormatted,
      });

      const { data, error } = await supabase
        .from('treasury_transactions')
        .insert({
          pod_id: podId,
          treasury_address: treasuryAddress,
          type,
          token_address: tokenAddress,
          token_symbol: tokenSymbol,
          token_decimals: tokenDecimals,
          amount_raw: amountRaw,
          amount_formatted: amountFormatted,
          sender_address: senderAddress,
          recipient_address: recipientAddress,
          sender_name: senderName,
          recipient_name: recipientName,
          reason,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        console.error('💾 Supabase insert error:', error);
        throw error;
      }
      console.log('💾 Transaction metadata stored:', data.id);
      return data.id;
    } catch (error) {
      console.error('💾 Failed to store transaction metadata:', error);
      throw error;
    }
  }

  /**
   * Update transaction status when blockchain confirms/fails
   */
  static async updateTransactionStatus(
    transactionId: string,
    status: 'completed' | 'failed',
    txHash?: string,
    blockNumber?: bigint,
    blockTimestamp?: Date,
    gasUsed?: bigint,
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (txHash) updateData.tx_hash = txHash;
      if (blockNumber) updateData.block_number = blockNumber.toString();
      if (blockTimestamp)
        updateData.block_timestamp = blockTimestamp.toISOString();
      if (gasUsed) updateData.gas_used = gasUsed.toString();

      const { error } = await supabase
        .from('treasury_transactions')
        .update(updateData)
        .eq('id', transactionId);

      if (error) throw error;
      console.log('💾 Transaction status updated:', transactionId, status);
    } catch (error) {
      console.error('💾 Failed to update transaction status:', error);
      throw error;
    }
  }

  /**
   * Get transaction history from Supabase (recommended approach)
   */
  static async getTransactionHistoryFromSupabase(
    podId: string,
    limit = 50,
  ): Promise<TreasuryTransaction[]> {
    try {
      console.log(
        '💾 Loading transaction history from Supabase for pod:',
        podId,
      );

      const { data, error } = await supabase
        .from('treasury_transactions')
        .select('*')
        .eq('pod_id', podId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const transactions: TreasuryTransaction[] = data.map((tx) => ({
        id: tx.id,
        type: tx.type as 'deposit' | 'withdrawal' | 'distribution',
        token: tx.token_address,
        amount: tx.amount_formatted,
        recipient: tx.recipient_address,
        sender: tx.sender_address,
        timestamp: new Date(tx.created_at),
        txHash: tx.tx_hash || '',
        reason: tx.reason,
        status: tx.status as 'pending' | 'completed' | 'failed',
      }));

      console.log(
        '💾 Loaded',
        transactions.length,
        'transactions from Supabase',
      );
      return transactions;
    } catch (error) {
      console.error(
        '💾 Failed to load transaction history from Supabase:',
        error,
      );
      return [];
    }
  }

  /**
   * Get transaction history from event logs (legacy approach - limited by block range)
   */
  static async getTransactionHistory(
    treasuryAddress: string,
    fromBlock?: bigint,
  ): Promise<TreasuryTransaction[]> {
    try {
      console.log(
        '🏦 [FIXED] Loading transaction history for treasury:',
        treasuryAddress,
      );

      // Get current block number and enforce strict 900 block limit to avoid RPC limits
      const currentBlock = await publicClient.getBlockNumber();
      const maxAllowedFromBlock = currentBlock - 900n;
      // Always enforce 900 block limit - no exceptions (safer than 1000)
      const effectiveFromBlock = currentBlock > 900n ? maxAllowedFromBlock : 0n;

      console.log(
        '🏦 Current block:',
        currentBlock.toString(),
        'Effective fromBlock:',
        effectiveFromBlock.toString(),
        '(enforcing 900 block limit)',
      );

      // Get FundsReceived and FundsDistributed events
      const [receivedLogs, distributedLogs] = await Promise.all([
        publicClient.getLogs({
          address: treasuryAddress as `0x${string}`,
          event: {
            type: 'event',
            name: 'FundsReceived',
            inputs: [
              { name: 'token', type: 'address', indexed: true },
              { name: 'amount', type: 'uint256' },
              { name: 'from', type: 'address' },
            ],
          },
          fromBlock: effectiveFromBlock,
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: treasuryAddress as `0x${string}`,
          event: {
            type: 'event',
            name: 'FundsDistributed',
            inputs: [
              { name: 'token', type: 'address', indexed: true },
              { name: 'amount', type: 'uint256' },
              { name: 'to', type: 'address', indexed: true },
              { name: 'reason', type: 'string' },
            ],
          },
          fromBlock: effectiveFromBlock,
          toBlock: 'latest',
        }),
      ]);

      // Process received events
      const receivedTransactions: TreasuryTransaction[] = receivedLogs.map(
        (log, index) => {
          const args = log.args as any;
          return {
            id: `deposit-${log.transactionHash}-${index}`,
            type: 'deposit' as const,
            token: args.token,
            amount: formatUnits(args.amount, 18), // TODO: Get actual decimals
            sender: args.from,
            timestamp: new Date(Number(log.blockNumber) * 1000), // Approximate
            txHash: log.transactionHash || '',
            status: 'completed' as const,
          };
        },
      );

      // Process distributed events
      const distributedTransactions: TreasuryTransaction[] =
        distributedLogs.map((log, index) => {
          const args = log.args as any;

          // Handle different event structures (direct treasury vs proxy)
          let amount: string;
          let recipient: string;

          if (args.amounts && Array.isArray(args.amounts)) {
            // Proxy event: sum all amounts for display
            const totalAmount = args.amounts.reduce(
              (sum: bigint, amt: bigint) => sum + amt,
              0n,
            );
            amount = formatUnits(totalAmount, 18);
            recipient = args.recipients?.[0] || 'Multiple Recipients';
          } else if (args.totalAmount) {
            // Proxy evenly distributed event
            amount = formatUnits(args.totalAmount, 18);
            recipient = args.recipients?.[0] || 'Multiple Recipients';
          } else if (args.amount) {
            // Direct treasury event
            amount = formatUnits(args.amount, 18);
            recipient = args.to;
          } else {
            // Fallback
            amount = '0';
            recipient = 'Unknown';
          }

          return {
            id: `distribution-${log.transactionHash}-${index}`,
            type: 'distribution' as const,
            token: args.token,
            amount: amount,
            recipient: recipient,
            timestamp: new Date(Number(log.blockNumber) * 1000), // Approximate
            txHash: log.transactionHash || '',
            reason: args.reason || '',
            status: 'completed' as const,
          };
        });

      // Combine and sort by timestamp
      const allTransactions = [
        ...receivedTransactions,
        ...distributedTransactions,
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      console.log(
        '🏦 Loaded transaction history:',
        allTransactions.length,
        'transactions',
      );
      return allTransactions;
    } catch (error) {
      console.error('🏦 Error loading transaction history:', error);
      return [];
    }
  }

  /**
   * Check if address has treasury management permissions
   */
  static async checkTreasuryPermissions(
    treasuryAddress: string,
    userAddress: string,
  ): Promise<boolean> {
    try {
      const treasuryContract = getContract({
        address: treasuryAddress as `0x${string}`,
        abi: POD_TREASURY_ABI,
        client: publicClient,
      });

      const isPodManager = await treasuryContract.read.isPodManager([
        userAddress as `0x${string}`,
      ]);
      console.log('🏦 Treasury permissions check:', {
        userAddress,
        isPodManager,
      });

      return isPodManager as boolean;
    } catch (error) {
      console.error('🏦 Error checking treasury permissions:', error);
      return false;
    }
  }

  /**
   * Prepare transaction calls for token distribution
   */
  static prepareDistributionTransaction(
    treasuryAddress: string,
    tokenAddress: string,
    recipients: string[],
    amounts: string[],
    decimals: number,
    reason: string,
  ) {
    // Convert amounts to wei
    const amountsBigInt = amounts.map((amount) => parseUnits(amount, decimals));

    console.log('🏦 Preparing distribution transaction:', {
      treasuryAddress,
      tokenAddress,
      recipients,
      amounts,
      amountsBigInt: amountsBigInt.map((a) => a.toString()),
      decimals,
      reason,
      totalAmountWei: amountsBigInt
        .reduce((sum, amt) => sum + amt, 0n)
        .toString(),
    });

    const transaction = {
      address: treasuryAddress as `0x${string}`, // Fixed: OnChainKit expects 'address'
      abi: POD_TREASURY_ABI,
      functionName: 'distributeTokens',
      args: [
        tokenAddress as `0x${string}`,
        recipients as `0x${string}`[],
        amountsBigInt,
        reason,
      ],
    };

    console.log('🏦 Final transaction object:', transaction);
    return transaction;
  }

  /**
   * Prepare transaction calls for equal distribution
   */
  static prepareEqualDistributionTransaction(
    treasuryAddress: string,
    tokenAddress: string,
    recipients: string[],
    totalAmount: string,
    decimals: number,
    reason: string,
  ) {
    const totalAmountBigInt = parseUnits(totalAmount, decimals);

    return {
      address: treasuryAddress as `0x${string}`, // Fixed: OnChainKit expects 'address'
      abi: POD_TREASURY_ABI,
      functionName: 'distributeTokensEvenly',
      args: [
        tokenAddress as `0x${string}`,
        recipients as `0x${string}`[],
        totalAmountBigInt,
        reason,
      ],
    };
  }

  /**
   * Prepare transaction call to add supported token
   */
  static prepareAddTokenTransaction(
    treasuryAddress: string,
    tokenAddress: string,
  ) {
    return {
      address: treasuryAddress as `0x${string}`, // Fixed: OnChainKit expects 'address'
      abi: POD_TREASURY_ABI,
      functionName: 'addSupportedToken',
      args: [tokenAddress as `0x${string}`],
    };
  }

  /**
   * Prepare transaction call to set authorized proxy
   */
  static prepareSetAuthorizedProxyTransaction(
    treasuryAddress: string,
    proxyAddress: string,
  ) {
    return {
      address: treasuryAddress as `0x${string}`,
      abi: POD_TREASURY_ABI,
      functionName: 'setAuthorizedProxy',
      args: [proxyAddress as `0x${string}`],
    };
  }

  /**
   * Prepare emergency withdraw + re-deposit transactions to sync existing tokens via PROXY
   * This handles tokens that were sent directly to the contract without using receiveTokens
   * UPDATED: Now uses proxy methods for sponsorship compatibility
   */
  static async prepareSyncTokensTransaction(
    treasuryAddress: string,
    userAddress: string,
    podId?: string,
  ) {
    try {
      console.log(
        '🔄 Preparing emergency withdraw + re-deposit sync for treasury:',
        treasuryAddress,
      );

      const treasuryContract = getContract({
        address: treasuryAddress as `0x${string}`,
        abi: POD_TREASURY_ABI,
        client: publicClient,
      });

      // Get supported tokens
      const supportedTokens =
        (await treasuryContract.read.getSupportedTokens()) as string[];
      const syncTransactions = [];

      for (const tokenAddress of supportedTokens) {
        try {
          const tokenContract = getContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            client: publicClient,
          });

          // Get actual ERC20 balance and internal balance
          const [externalBalance, internalBalance] = await Promise.all([
            tokenContract.read.balanceOf([
              treasuryAddress as `0x${string}`,
            ]) as Promise<bigint>,
            treasuryContract.read.getBalance([tokenAddress as `0x${string}`]) as Promise<bigint>,
          ]);

          // If external balance > internal balance, we need to sync
          if (externalBalance > internalBalance) {
            const syncAmount = externalBalance - internalBalance;
            console.log(
              '🔄 Token needs sync via emergency withdraw + re-deposit:',
              {
                token: tokenAddress,
                externalBalance: externalBalance.toString(),
                internalBalance: internalBalance.toString(),
                syncAmount: syncAmount.toString(),
              },
            );

            // Determine if we can use proxy (requires podId and proxy address)
            const proxyAddress = process.env.NEXT_PUBLIC_TREASURY_PROXY;
            const canUseProxy = podId && proxyAddress;

            if (canUseProxy) {
              console.log(
                '🔄 Using PROXY methods for sponsored sync (scalable)',
              );

              // Step 1: Proxy emergency withdraw to user
              syncTransactions.push({
                address: proxyAddress as `0x${string}`,
                abi: TREASURY_PROXY_ABI,
                functionName: 'proxyEmergencyWithdraw',
                args: [
                  podId,
                  tokenAddress as `0x${string}`,
                  userAddress as `0x${string}`,
                  syncAmount,
                ],
              });

              // Step 2: Approve proxy to spend the tokens (user approves proxy)
              syncTransactions.push({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [proxyAddress as `0x${string}`, syncAmount],
              });

              // Step 3: Re-deposit via proxy
              syncTransactions.push({
                address: proxyAddress as `0x${string}`,
                abi: TREASURY_PROXY_ABI,
                functionName: 'proxyReceiveTokens',
                args: [podId, tokenAddress as `0x${string}`, syncAmount],
              });
            } else {
              console.warn(
                '🔄 Using DIRECT treasury methods (not sponsored) - proxy or podId missing',
              );

              // Fallback: Direct treasury calls (not sponsored)
              // Step 1: Emergency withdraw to user
              syncTransactions.push({
                address: treasuryAddress as `0x${string}`,
                abi: POD_TREASURY_ABI,
                functionName: 'emergencyWithdraw',
                args: [
                  tokenAddress as `0x${string}`,
                  userAddress as `0x${string}`,
                  syncAmount,
                ],
              });

              // Step 2: Approve treasury to spend the tokens
              syncTransactions.push({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [treasuryAddress as `0x${string}`, syncAmount],
              });

              // Step 3: Re-deposit via receiveTokens
              syncTransactions.push({
                address: treasuryAddress as `0x${string}`,
                abi: POD_TREASURY_ABI,
                functionName: 'receiveTokens',
                args: [tokenAddress as `0x${string}`, syncAmount],
              });
            }
          }
        } catch (error) {
          console.error(
            '🔄 Error checking token sync for:',
            tokenAddress,
            error,
          );
        }
      }

      console.log(
        '🔄 Prepared sync transactions (emergency withdraw + re-deposit):',
        syncTransactions.length,
      );
      return syncTransactions;
    } catch (error) {
      console.error('🔄 Error preparing sync transactions:', error);
      return [];
    }
  }

  /**
   * Get treasury contract info
   */
  static async getTreasuryInfo(treasuryAddress: string) {
    try {
      console.log(
        '🏦 Creating treasury contract instance for:',
        treasuryAddress,
      );
      console.log('🏦 PublicClient available:', !!publicClient);
      console.log('🏦 POD_TREASURY_ABI available:', !!POD_TREASURY_ABI);

      // Validate treasury address format
      if (
        !treasuryAddress ||
        treasuryAddress === '0x0000000000000000000000000000000000000000'
      ) {
        throw new Error(
          'Invalid treasury address: Treasury has not been deployed yet.',
        );
      }

      const treasuryContract = getContract({
        address: treasuryAddress as `0x${string}`,
        abi: POD_TREASURY_ABI,
        client: publicClient,
      });

      console.log('🏦 Treasury contract instance:', treasuryContract);
      console.log(
        '🏦 Contract read methods available:',
        !!treasuryContract?.read,
      );

      const supportedTokens = await treasuryContract.read.getSupportedTokens();

      return {
        address: treasuryAddress,
        supportedTokens: supportedTokens as string[],
      };
    } catch (error) {
      console.error('🏦 Error getting treasury info:', error);
      throw error;
    }
  }

  /**
   * PROXY METHODS - Use these for sponsored transactions
   * These methods call the TreasuryProxy contract instead of individual treasuries
   */

  /**
   * Prepare proxy distribution transaction (for sponsored transactions)
   */
  static prepareProxyDistributionTransaction(
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipients: string[],
    amounts: string[],
    decimals: number,
    reason: string,
  ) {
    // Convert amounts to wei
    const amountsBigInt = amounts.map((amount) => parseUnits(amount, decimals));

    console.log('🔄 Preparing PROXY distribution transaction:', {
      proxyAddress,
      podId,
      tokenAddress,
      recipients,
      amounts,
      amountsBigInt: amountsBigInt.map((a) => a.toString()),
      decimals,
      reason,
      totalAmountWei: amountsBigInt
        .reduce((sum, amt) => sum + amt, 0n)
        .toString(),
    });

    const transaction = {
      address: proxyAddress as `0x${string}`,
      abi: TREASURY_PROXY_ABI,
      functionName: 'proxyDistributeTokens',
      args: [
        podId,
        tokenAddress as `0x${string}`,
        recipients as `0x${string}`[],
        amountsBigInt,
        reason,
      ],
    };

    console.log('🔄 Final PROXY transaction object:', transaction);
    return transaction;
  }

  /**
   * Prepare proxy equal distribution transaction
   */
  static prepareProxyEqualDistributionTransaction(
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipients: string[],
    totalAmount: string,
    decimals: number,
    reason: string,
  ) {
    const totalAmountBigInt = parseUnits(totalAmount, decimals);

    console.log('🔄 Preparing PROXY equal distribution transaction:', {
      proxyAddress,
      podId,
      tokenAddress,
      recipients,
      totalAmount,
      totalAmountBigInt: totalAmountBigInt.toString(),
      decimals,
      reason,
    });

    return {
      address: proxyAddress as `0x${string}`,
      abi: TREASURY_PROXY_ABI,
      functionName: 'proxyDistributeTokensEvenly',
      args: [
        podId,
        tokenAddress as `0x${string}`,
        recipients as `0x${string}`[],
        totalAmountBigInt,
        reason,
      ],
    };
  }

  /**
   * Prepare proxy emergency withdraw transaction
   */
  static prepareProxyEmergencyWithdraw(
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipient: string,
    amount: string,
    decimals: number,
  ) {
    const amountBigInt = parseUnits(amount, decimals);

    return {
      address: proxyAddress as `0x${string}`,
      abi: TREASURY_PROXY_ABI,
      functionName: 'proxyEmergencyWithdraw',
      args: [
        podId,
        tokenAddress as `0x${string}`,
        recipient as `0x${string}`,
        amountBigInt,
      ],
    };
  }

  /**
   * Prepare proxy single distribution transaction (optimized for single recipient)
   */
  static prepareProxyDistributeSingleTransaction(
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    recipient: string,
    amount: string,
    decimals: number,
    reason: string,
  ) {
    const amountBigInt = parseUnits(amount, decimals);

    console.log(
      '🎯 Preparing SINGLE PROXY distribution (sponsorship optimized):',
      {
        proxyAddress,
        podId,
        tokenAddress,
        recipient,
        amount,
        amountBigInt: amountBigInt.toString(),
        decimals,
        reason,
      },
    );

    const transaction = {
      address: proxyAddress as `0x${string}`,
      abi: TREASURY_PROXY_ABI,
      functionName: 'proxyDistributeSingle',
      args: [
        podId,
        tokenAddress as `0x${string}`,
        recipient as `0x${string}`,
        amountBigInt,
        reason,
      ],
    };

    console.log('🎯 Final SINGLE PROXY transaction object:', transaction);
    return transaction;
  }

  /**
   * Prepare proxy receive tokens transaction
   */
  static prepareProxyReceiveTokens(
    proxyAddress: string,
    podId: string,
    tokenAddress: string,
    amount: string,
    decimals: number,
  ) {
    const amountBigInt = parseUnits(amount, decimals);

    return {
      address: proxyAddress as `0x${string}`,
      abi: TREASURY_PROXY_ABI,
      functionName: 'proxyReceiveTokens',
      args: [podId, tokenAddress as `0x${string}`, amountBigInt],
    };
  }
}
