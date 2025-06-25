// src/features/shopping-cart/components/Cart/Cart.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useRouter } from "next/navigation";
import { parseUnits } from "ethers";
import { Interface } from "ethers/lib/utils";
import purchaseBurnABI from "src/abis/purchaseBurnABI.json";
import { erc20ABI } from "src/utils/erc20ABI";
import useCart from "src/features/shopping-cart/contexts/cart-context/useCart";
import CartProducts from "src/features/shopping-cart/components/cart/cartproducts";
import formatPrice from "src/features/shopping-cart/utils/formatPrice";
import debounce from "lodash.debounce";
import { serialize } from 'wagmi';
import { BaseError } from 'viem';
import { getPublicClient } from '@wagmi/core';

// Import the full set of transaction components
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";
import * as S from "./style";

const TransactionButtonStyled = styled(TransactionButton)`
  background-color: #0070f3 !important;
  color: #fff !important;
  border-radius: 6px !important;
  border: none !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 1rem !important;
  cursor: pointer !important;
  transition: background-color 0.2s ease !important;

  &:hover {
    background-color: #005bb5 !important;
  }
`;


const parsedErc20ABI = [
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

const approveAbi = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

export type Token = {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
};

const BASE_CHAIN_ID = 8453;

function formatTokenAmount(amount: number): bigint {
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount: must be a non-negative number');
  }
  // Convert to string with fixed precision to avoid floating point issues
  const amountStr = amount.toFixed(18);
  return parseUnits(amountStr, 18);
}

const tokenOptions: Token[] = [
  {
    name: "$SYSTEM",
    address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string,
    symbol: "$SYSTEM",
    decimals: 18,
    image: "/images/erc20tokens/SystemToken.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "$SELF",
    address: process.env.NEXT_PUBLIC_SELF_TOKEN as string,
    symbol: "$SELF",
    decimals: 18,
    image: "/images/erc20tokens/SelfToken.png",
    chainId: BASE_CHAIN_ID,
  },
];

// Add error logging utility with rate limiting
const ERROR_LOG_KEY = 'commapp_error_logs';
const MAX_LOGS = 100; // Maximum number of logs to keep

const logError = async (error: unknown, context: string) => {
  try {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        })
      } : error
    };

    // Log to console with grouping
    console.group(`Error Log - ${context}`);
    console.log('Timestamp:', timestamp);
    console.log('Context:', context);
    console.log('Error Details:', errorLog.error);
    console.groupEnd();

    // Store in localStorage with rate limiting
    try {
      const existingLogsStr = localStorage.getItem(ERROR_LOG_KEY);
      const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
      
      // Add new log and maintain max size
      existingLogs.unshift(errorLog);
      if (existingLogs.length > MAX_LOGS) {
        existingLogs.length = MAX_LOGS;
      }
      
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existingLogs));
    } catch (storageError) {
      console.error('Failed to store error log:', storageError);
    }

    // Additional error details for debugging
    if (error instanceof Error) {
      console.error('Additional error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        })
      });
    }
  } catch (e) {
    console.error('Error in logError:', e);
  }
};

// Add transaction data validation utility
const validateTransactionData = (data: any) => {
  const validation = {
    isValid: true,
    issues: [] as string[],
    data: {} as any
  };

  try {
    // Deep clone the data to avoid modifying the original
    validation.data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));

    // Validate required fields
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');
    
    // Validate calls array
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address) validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName) validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args)) validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }

    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(`Serialization error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return validation;
};

// Add utility to retrieve logs
const getErrorLogs = () => {
  try {
    const logsStr = localStorage.getItem(ERROR_LOG_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (e) {
    console.error('Failed to retrieve error logs:', e);
    return [];
  }
};

// Add utility to clear logs
const clearErrorLogs = () => {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
    console.log('Error logs cleared');
  } catch (e) {
    console.error('Failed to clear error logs:', e);
  }
};

const validatePaymasterConfig = () => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!paymasterEndpoint) {
    console.error('Paymaster endpoint not configured');
    return false;
  }
  
  // Validate paymaster endpoint format
  try {
    new URL(paymasterEndpoint);
    return true;
  } catch (e) {
    console.error('Invalid paymaster endpoint URL:', paymasterEndpoint);
    return false;
  }
};

const logTransactionLifecycle = (stage: string, data: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Transaction ${stage}:`, {
    ...data,
    paymasterConfig: {
      endpoint: process.env.NEXT_PUBLIC_PAYMASTER,
      isValid: validatePaymasterConfig()
    }
  });
};

const simulateTransaction = async (calls: any[], publicClient: any, userAddress: string) => {
  try {
    const simulation = await publicClient.simulateContract({
      ...calls[0],
      account: userAddress,
    });
    
    console.log('Transaction simulation successful:', {
      simulation,
      calls: calls[0],
      account: userAddress
    });
    
    return true;
  } catch (error) {
    console.error('Transaction simulation failed:', {
      error,
      calls: calls[0],
      account: userAddress
    });
    return false;
  }
};

const isCoinbaseWalletError = (error: any): boolean => {
  return error?.message?.includes('scanTxTimeout') || 
         error?.message?.includes('api.wallet.coinbase.com');
};

const checkETHBalance = async (address: string): Promise<boolean> => {
  try {
    const publicClient = await getPublicClient();
    const balance = await publicClient.getBalance({ address: address as `0x${string}` });
    // We need at least 0.001 ETH for gas
    const minRequired = 1000000000000000n; // 0.001 ETH in wei
    return balance >= minRequired;
  } catch (error) {
    console.error('Error checking ETH balance:', error);
    return false;
  }
};

const logWalletState = async (userAddress: string) => {
  try {
    const publicClient = await getPublicClient();
    const [balance, network, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getNetwork(),
      publicClient.getBlockNumber()
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      network: {
        chainId: network.chainId,
        name: network.name
      },
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging wallet state:', error);
  }
};

const logNetworkConditions = async () => {
  try {
    const publicClient = await getPublicClient();
    const [gasPrice, block] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getBlock()
    ]);

    console.log('Network Conditions:', {
      gasPrice: gasPrice.toString(),
      gasPriceInGwei: Number(gasPrice) / 1e9,
      blockNumber: block.number.toString(),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      baseFeePerGas: block.baseFeePerGas?.toString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging network conditions:', error);
  }
};

const logTransactionParameters = (calls: any[], isSponsored: boolean) => {
  console.log('Transaction Parameters:', {
    calls: calls.map(call => ({
      address: call.address,
      functionName: call.functionName,
      args: call.args.map((arg: any) => {
        if (typeof arg === 'bigint') {
          return {
            value: arg.toString(),
            type: 'bigint'
          };
        }
        return arg;
      })
    })),
    isSponsored,
    timestamp: new Date().toISOString()
  });
};

const getTransactionConfig = async (userAddress: string) => {
  try {
    // Log initial state
    await logWalletState(userAddress);
    await logNetworkConditions();

    const hasETH = await checkETHBalance(userAddress);
    const paymasterStatus = validatePaymasterConfig();
    
    console.log('Transaction Configuration Decision:', {
      hasETH,
      paymasterStatus,
      address: userAddress,
      timestamp: new Date().toISOString(),
      decision: hasETH && !paymasterStatus ? 'non-sponsored' :
                hasETH && paymasterStatus ? 'sponsored-with-fallback' :
                !hasETH && paymasterStatus ? 'sponsored-only' : 'cannot-proceed'
    });

    // If we have ETH and paymaster is not working, use non-sponsored
    if (hasETH && !paymasterStatus) {
      console.log('Using non-sponsored transaction due to paymaster issues');
      return { isSponsored: false };
    }

    // If we have ETH but paymaster is working, try sponsored first
    if (hasETH && paymasterStatus) {
      console.log('Using sponsored transaction with ETH fallback available');
      return { isSponsored: true, hasFallback: true };
    }

    // If no ETH, we must use sponsored
    if (!hasETH && paymasterStatus) {
      console.log('Using sponsored transaction (no ETH available)');
      return { isSponsored: true, hasFallback: false };
    }

    // If no ETH and no paymaster, we can't proceed
    throw new Error('No ETH for gas and paymaster not available');
  } catch (error) {
    console.error('Error getting transaction config:', error);
    throw error;
  }
};

const handleTransactionError = async (error: Error, context: string) => {
  try {
    const userAddress = address?.toLowerCase();
    if (!userAddress) {
      throw new Error('No user address available');
    }

    // Log state before error handling
    await logWalletState(userAddress);
    await logNetworkConditions();

    const calls = context === 'approval' ? getApproveCall() : getPurchaseCall();
    const publicClient = await getPublicClient();
    const simulationSuccess = await simulateTransaction(calls, publicClient, userAddress);
    
    // Get current transaction config
    const txConfig = await getTransactionConfig(userAddress);
    const isCoinbaseError = isCoinbaseWalletError(error);
    
    // Log transaction parameters
    logTransactionParameters(calls, txConfig.isSponsored);
    
    logTransactionLifecycle('Error', {
      type: context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        isCoinbaseError,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        })
      },
      transactionData: {
        address: userAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        ...txConfig,
        simulationSuccess,
        walletType: 'coinbase',
        timestamp: new Date().toISOString()
      }
    });

    // If it's a Coinbase Wallet error and we have a fallback available
    if (isCoinbaseError && txConfig.hasFallback) {
      console.warn('Coinbase Wallet error detected with fallback available. Retrying with non-sponsored transaction...', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return { shouldRetry: true, useSponsored: false };
    }

    await logError(error, `${context} Transaction Error`);
    return { shouldRetry: false };
  } catch (e) {
    console.error(`Error in ${context} error handler:`, e);
    return { shouldRetry: false };
  }
};

export default function Cart({
  tokenBalances,
}: {
  tokenBalances: { systemBalance: string; selfBalance: string };
}) {
  const { products = [], total, isOpen, closeCart } = useCart();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();

  const [selectedToken, setSelectedToken] = useState<Token>(tokenOptions[0]);
  const [txStep, setTxStep] = useState<"approve" | "purchase">("approve");

  const totalSystemPrice = total?.totalSystemPrice ?? 0;
  const totalSelfPrice = total?.totalSelfPrice ?? 0;

  const systemApprovalAmount = formatTokenAmount(totalSystemPrice);
  const selfApprovalAmount = formatTokenAmount(totalSelfPrice);

  useEffect(() => {
    console.log("Approval Amounts:", {
      system: systemApprovalAmount.toString(),
      self: selfApprovalAmount.toString(),
    });
  }, [systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    const debouncedCheckBalances = debounce(async () => {
      if (!address || !publicClient) return;

      try {
        const systemToken = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
        const selfToken = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

        const systemBalance = await publicClient.readContract({
          address: systemToken,
          abi: parsedErc20ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        const selfBalance = await publicClient.readContract({
          address: selfToken,
          abi: parsedErc20ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        console.log("Token balances:", {
          system: systemBalance.toString(),
          self: selfBalance.toString(),
          requiredSystem: systemApprovalAmount.toString(),
          requiredSelf: selfApprovalAmount.toString(),
        });
      } catch (error) {
        console.error("Error checking balances:", error);
      }
    }, 5000);

    debouncedCheckBalances();

    return () => {
      debouncedCheckBalances.cancel();
    };
  }, [address, publicClient, systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    async function debugContractState() {
      if (!address || !publicClient) return;
      try {
        const blockNumber = await publicClient.getBlockNumber();
        console.log("Debug:", {
          systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
          chainId: walletClient?.chain?.id,
          blockNumber,
        });
      } catch (error) {
        console.error("Debug check failed:", error);
      }
    }
    debugContractState();
  }, [address, publicClient, walletClient]);

  // Debug sponsorship config
  useEffect(() => {
    console.log("Transaction sponsorship config:", {
      isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER),
      paymasterEndpoint: process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 20) + "...",
      isSponsored: true,
      chainId: BASE_CHAIN_ID,
      contracts: {
        system: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
        self: process.env.NEXT_PUBLIC_SELF_TOKEN,
        purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
      },
    });
  }, []);

  useEffect(() => {
    if (walletClient) {
      console.log('Wallet State:', {
        chainId: walletClient.chain?.id,
        network: walletClient.chain?.name,
        isConnected: Boolean(address)
      });
    }
  }, [walletClient, address]);

  const productId = products.map((p) => p.id).join(",");

  // Modified getApproveCall returning an array of call objects
  const getApproveCall = useCallback(() => {
    try {
      console.log('Starting getApproveCall with:', {
        selectedToken,
        totalSystemPrice: totalSystemPrice.toString(),
        totalSelfPrice: totalSelfPrice.toString(),
        address
      });

      if (!selectedToken) {
        console.error('Invalid token selection');
        throw new Error('Invalid token selection');
      }

      const tokenAddress = selectedToken.address as `0x${string}`;
      const spenderAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
      const formattedAddress = address?.toLowerCase() as `0x${string}`;

      console.log('Address validation:', {
        tokenAddress,
        spenderAddress,
        formattedAddress,
        isValidTokenAddress: tokenAddress?.startsWith('0x') && tokenAddress.length === 42,
        isValidSpenderAddress: spenderAddress?.startsWith('0x') && spenderAddress.length === 42,
        isValidUserAddress: formattedAddress?.startsWith('0x') && formattedAddress.length === 42
      });

      // Validate addresses
      if (!tokenAddress || !spenderAddress || !formattedAddress) {
        console.error('Invalid addresses:', { tokenAddress, spenderAddress, formattedAddress });
        throw new Error('Invalid addresses');
      }

      // Ensure amounts are valid numbers
      if (isNaN(Number(totalSystemPrice)) || isNaN(Number(totalSelfPrice))) {
        console.error('Invalid amounts:', { totalSystemPrice, totalSelfPrice });
        throw new Error('Invalid amounts');
      }

      // Format approval amount based on token with proper decimal handling
      const decimals = selectedToken.decimals;
      const rawAmount = selectedToken.symbol === "$SYSTEM" ? totalSystemPrice : totalSelfPrice;
      const amountWithDecimals = Number(rawAmount) * Math.pow(10, decimals);
      const approvalAmount = BigInt(Math.floor(amountWithDecimals));

      console.log('Amount formatting details:', {
        rawAmount,
        decimals,
        amountWithDecimals,
        approvalAmount: approvalAmount.toString(),
        isBigInt: typeof approvalAmount === 'bigint',
        tokenSymbol: selectedToken.symbol
      });

      const calls = [{
        address: tokenAddress,
        abi: approveAbi,
        functionName: 'approve',
        args: [
          spenderAddress,
          approvalAmount,
        ],
      }];
      console.log('Approve calls:', calls);

      const transactionData = {
        address: formattedAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        isSponsored: true
      };

      // Validate transaction data
      const validation = validateTransactionData(transactionData);
      if (!validation.isValid) {
        throw new Error(`Invalid transaction data: ${validation.issues.join(', ')}`);
      }

      // Log validated transaction data
      console.log('Validated transaction data:', validation.data);

      return calls;
    } catch (error) {
      logError(error, 'getApproveCall');
      throw error;
    }
  }, [selectedToken, totalSystemPrice, totalSelfPrice, address]);

  // Modified getPurchaseCall returning an array of call objects
  const getPurchaseCall = useCallback(() => {
    try {
      console.log('Starting getPurchaseCall with:', {
        productId,
        selectedToken,
        systemApprovalAmount: systemApprovalAmount.toString(),
        selfApprovalAmount: selfApprovalAmount.toString(),
        address
      });

      // Validate productId
      if (!productId) {
        console.error('Invalid product ID:', productId);
        throw new Error('Invalid product ID');
      }

      // Ensure address is properly formatted
      const formattedAddress = address?.toLowerCase() as `0x${string}`;
      if (!formattedAddress || !formattedAddress.startsWith('0x') || formattedAddress.length !== 42) {
        console.error('Invalid user address:', formattedAddress);
        throw new Error('Invalid user address');
      }

      // Validate amounts
      if (isNaN(Number(systemApprovalAmount)) || isNaN(Number(selfApprovalAmount))) {
        console.error('Invalid approval amounts:', {
          systemApprovalAmount: systemApprovalAmount.toString(),
          selfApprovalAmount: selfApprovalAmount.toString()
        });
        throw new Error('Invalid approval amounts');
      }

      const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
      console.log('Purchase burn contract details:', {
        address: purchaseBurnAddress,
        isValidAddress: purchaseBurnAddress?.startsWith('0x') && purchaseBurnAddress.length === 42,
        abiValidation: {
          hasPurchaseArtifact: purchaseBurnABI.some(item => item.name === 'purchaseArtifact'),
          abiLength: purchaseBurnABI.length
        }
      });

      // Ensure BigInt values are properly formatted with decimal handling
      const decimals = selectedToken.decimals;
      const systemAmount = BigInt(Math.floor(Number(systemApprovalAmount) * Math.pow(10, decimals)));
      const selfAmount = BigInt(Math.floor(Number(selfApprovalAmount) * Math.pow(10, decimals)));
      const zeroAmount = 0n;

      console.log('Purchase amount formatting:', {
        systemAmount: systemAmount.toString(),
        selfAmount: selfAmount.toString(),
        zeroAmount: zeroAmount.toString(),
        decimals,
        rawAmounts: {
          system: systemApprovalAmount,
          self: selfApprovalAmount
        },
        isBigInt: {
          system: typeof systemAmount === 'bigint',
          self: typeof selfAmount === 'bigint',
          zero: typeof zeroAmount === 'bigint'
        }
      });

      const calls = selectedToken.symbol === "$SYSTEM" 
        ? [{
            address: purchaseBurnAddress,
            abi: purchaseBurnABI,
            functionName: "purchaseArtifact",
            args: [systemAmount, zeroAmount, productId],
          }]
        : [{
            address: purchaseBurnAddress,
            abi: purchaseBurnABI,
            functionName: "purchaseArtifact",
            args: [zeroAmount, selfAmount, productId],
          }];

      const transactionData = {
        address: formattedAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        isSponsored: true
      };

      // Validate transaction data
      const validation = validateTransactionData(transactionData);
      if (!validation.isValid) {
        throw new Error(`Invalid transaction data: ${validation.issues.join(', ')}`);
      }

      // Log validated transaction data
      console.log('Validated transaction data:', validation.data);

      return calls;
    } catch (error) {
      logError(error, 'getPurchaseCall');
      throw error;
    }
  }, [selectedToken, systemApprovalAmount, selfApprovalAmount, productId, address]);

  return (
    <S.CartOverlay onClick={closeCart}>
      <S.CartContent onClick={(e) => e.stopPropagation()}>
        <S.CartContentHeader>
          <S.HeaderTitle>Artifacts</S.HeaderTitle>
        </S.CartContentHeader>

        <CartProducts products={products} />

        <S.CartFooter>
          <S.Sub>SUBTOTAL</S.Sub>
          <S.SubPrice>
            {selectedToken.symbol === "$SYSTEM"
              ? `$SYSTEM ${formatPrice(totalSystemPrice, "$SYSTEM")}`
              : `$SELF ${formatPrice(totalSelfPrice, "$SELF")}`}
          </S.SubPrice>

          <div style={{ margin: "1rem 0" }}>
            <S.TokenRadioLabel style={{ marginRight: "1rem" }}>
              <input
                type="radio"
                name="tokenSelection"
                value="$SYSTEM"
                checked={selectedToken.symbol === "$SYSTEM"}
                onChange={() => setSelectedToken(tokenOptions[0])}
              />
              <img
                src="/images/erc20tokens/SystemToken.png"
                alt="$SYSTEM"
                style={{
                  width: "24px",
                  height: "24px",
                  verticalAlign: "middle",
                  marginRight: "4px",
                  border: "none",
                }}
              />
              $SYSTEM
            </S.TokenRadioLabel>
            <S.TokenRadioLabel>
              <input
                type="radio"
                name="tokenSelection"
                value="$SELF"
                checked={selectedToken.symbol === "$SELF"}
                onChange={() => setSelectedToken(tokenOptions[1])}
              />
              <img
                src="/images/erc20tokens/SelfToken.png"
                alt="$SELF"
                style={{
                  width: "24px",
                  height: "24px",
                  verticalAlign: "middle",
                  marginRight: "4px",
                  border: "none",
                }}
              />
              $SELF
            </S.TokenRadioLabel>
          </div>

          {/* Conditional rendering of the Transaction component based on txStep */}
          {txStep === "approve" ? (
            <Transaction
              address={address?.toLowerCase() as `0x${string}`}
              chainId={BASE_CHAIN_ID}
              calls={getApproveCall()}
              isSponsored={true}
              onSuccess={() => {
                logTransactionLifecycle('Success', {
                  type: 'approval',
                  address,
                  chainId: BASE_CHAIN_ID
                });
                console.log('Approval transaction succeeded');
                setTxStep("purchase");
              }}
              onError={async (error: Error) => {
                const result = await handleTransactionError(error, 'approval');
                if (result.shouldRetry) {
                  // Here we would implement the retry logic with the new config
                  console.log('Retrying transaction with non-sponsored configuration...');
                }
              }}
            >
              <TransactionButton
                text="Approve"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          ) : (
            <Transaction
              address={address?.toLowerCase() as `0x${string}`}
              chainId={BASE_CHAIN_ID}
              calls={getPurchaseCall()}
              isSponsored={true}
              onSuccess={() => {
                console.log('Purchase transaction succeeded');
                alert("✅ Purchase completed!");
                router.push("/home");
                closeCart();
              }}
              onError={(error: Error) => handleTransactionError(error, 'purchase')}
            >
              <TransactionButton
                text="Purchase"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          )}
        </S.CartFooter>
      </S.CartContent>
    </S.CartOverlay>
  );
}
