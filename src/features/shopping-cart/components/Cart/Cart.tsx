// src/features/shopping-cart/components/Cart/Cart.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useRouter } from "next/navigation";
import { parseUnits } from "ethers";
import { Interface } from "ethers/lib/utils";
const purchaseBurnABI = require('src/abis/purchaseBurnABI.json');
import useCart from 'src/features/shopping-cart/contexts/cart-context/useCart';
import CartProducts from 'src/features/shopping-cart/components/Cart/CartProducts';
import formatPrice from 'src/utils/formatPrice';
import debounce from "lodash.debounce";
import { serialize } from 'wagmi';
import { BaseError } from 'viem';
import { getPublicClient } from '@wagmi/core';
import { notificationService } from 'src/utils/notificationService';


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

    // Get current transaction config
    const txConfig = await getTransactionConfig(userAddress);
    const isCoinbaseError = isCoinbaseWalletError(error);
    
    // Log transaction parameters
    logTransactionParameters([], txConfig.isSponsored);
    
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
        calls: [], // Empty calls for now
        ...txConfig,
        simulationSuccess: false, // No simulation for direct purchase
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

// Add comprehensive UserOperation debugging
const debugUserOperation = (calls: any[], context: string) => {
  console.group(`🔍 UserOperation Debug - ${context}`);
  console.log('📋 Calls Array:', calls);
  console.log('📋 Calls Array Length:', calls.length);
  console.log('📋 Contract Addresses:', calls.map(call => call.address));
  console.log('📋 Function Names:', calls.map(call => call.functionName));
  console.log('📋 Arguments:', calls.map(call => call.args));
  console.log('📋 ABI Validation:', calls.map(call => ({
    address: call.address,
    hasABI: Boolean(call.abi),
    abiLength: call.abi?.length || 0,
    hasFunction: call.abi?.some((item: any) => item.name === call.functionName)
  })));
  
  // Add detailed ABI inspection
  calls.forEach((call, index) => {
    console.log(`📋 Call ${index} Details:`, {
      address: call.address,
      functionName: call.functionName,
      args: call.args,
      abi: call.abi,
      abiFunctions: call.abi?.filter((item: any) => item.type === 'function').map((item: any) => item.name)
    });
  });
  
  console.log('🔧 Environment Variables:', {
    purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
    systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
    selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
    paymaster: process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 30) + '...'
  });
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.groupEnd();
};

// Add paymaster configuration validation
const validatePaymasterSetup = () => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN;
  
  // TODO: Temporarily disabled to prevent console spam/infinite loops
  // console.group('🔧 Paymaster Configuration Validation');
  // console.log('✅ Paymaster Endpoint:', paymasterEndpoint ? 'Configured' : '❌ Missing');
  // console.log('✅ Purchase Burn Contract:', purchaseBurnAddress ? 'Configured' : '❌ Missing');
  // console.log('✅ Chain ID:', BASE_CHAIN_ID);
  // console.log('✅ EntryPoint Address:', '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
  
  // if (!paymasterEndpoint) {
  //   console.error('❌ NEXT_PUBLIC_PAYMASTER environment variable is not set');
  // }
  // if (!purchaseBurnAddress) {
  //   console.error('❌ NEXT_PUBLIC_PURCHASE_BURN environment variable is not set');
  // }
  // console.groupEnd();
  
  return {
    paymasterConfigured: Boolean(paymasterEndpoint),
    contractConfigured: Boolean(purchaseBurnAddress),
    isValid: Boolean(paymasterEndpoint && purchaseBurnAddress)
  };
};

// Removed handlePaymasterError: no longer needed for direct purchase-only flow

// Add utility to verify contract events
const verifyContractEvents = async (transactionHash: string, purchaseBurnAddress: string, providedPublicClient?: any) => {
  let publicClientToUse = providedPublicClient;
  
  if (!publicClientToUse) {
    try {
      publicClientToUse = await getPublicClient();
    } catch (error) {
      console.error('Failed to get public client in verifyContractEvents:', error);
      return false;
    }
  }
  
  if (!publicClientToUse) {
    console.error('publicClient is undefined in verifyContractEvents');
    return false;
  }
  try {
    // Get transaction receipt
    const receipt = await publicClientToUse.getTransactionReceipt({ hash: transactionHash as `0x${string}` });
    
    console.group('🔍 Contract Event Verification');
    console.log('📋 Transaction Hash:', transactionHash);
    console.log('📋 Purchase Burn Address:', purchaseBurnAddress);
    console.log('📋 Total Logs:', receipt.logs.length);
    
    // Filter logs for our contract
    const contractLogs = receipt.logs.filter(log => 
      log.address.toLowerCase() === purchaseBurnAddress.toLowerCase()
    );
    
    console.log('📋 Contract Logs Found:', contractLogs.length);
    
    if (contractLogs.length > 0) {
      console.log('📋 Contract Events:', contractLogs);
      
      // Check for PurchaseArtifact event
      const purchaseEvents = contractLogs.filter(log => {
        if (!('topics' in log) || !Array.isArray((log as any).topics)) return false;
        // The event signature for PurchaseArtifact
        const eventSignature = 'PurchaseArtifact(address,uint256,uint256,string,uint256)';
        const eventTopic = '0x' + eventSignature.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
        return (log as any).topics[0] === eventTopic;
      });
      
      console.log('📋 PurchaseArtifact Events:', purchaseEvents.length);
      
      if (purchaseEvents.length > 0) {
        console.log('✅ PurchaseArtifact event found!');
        console.log('📋 Event Details:', purchaseEvents[0]);
      } else {
        console.warn('⚠️ No PurchaseArtifact event found');
      }
    } else {
      console.warn('⚠️ No logs found for purchase burn contract');
    }
    
    console.groupEnd();
    return contractLogs.length > 0;
  } catch (error) {
    console.error('❌ Error verifying contract events:', error);
    return false;
  }
};

function DebugTransaction(props) {
  console.log('DebugTransaction received calls:', JSON.stringify(props.calls, null, 2));
  return <Transaction {...props} />;
}

export default function Cart({
  tokenBalances,
}: {
  tokenBalances: { systemBalance: string; selfBalance: string };
}) {
  const { products = [], total, isOpen, closeCart, clearCart } = useCart();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();

  const [selectedToken, setSelectedToken] = useState<Token>(tokenOptions[0]);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const MAX_RETRIES = 3;

  const totalSystemPrice = total?.totalSystemPrice ?? 0;
  const totalSelfPrice = total?.totalSelfPrice ?? 0;

  const systemApprovalAmount = formatTokenAmount(totalSystemPrice);
  const selfApprovalAmount = formatTokenAmount(totalSelfPrice);

  // Add state for allowance and approval
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveTxSuccess, setApproveTxSuccess] = useState(false);

  // Check allowance for selected token
  useEffect(() => {
    const checkAllowance = async () => {
      if (!address || !publicClient) return;
      
      setIsCheckingAllowance(true);
      try {
        const tokenAddress = selectedToken.symbol === "$SYSTEM" 
          ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
          : process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
        const purchaseBurn = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
        
        const result = await publicClient.readContract({
          address: tokenAddress,
          abi: parsedErc20ABI,
          functionName: 'allowance',
          args: [address as `0x${string}`, purchaseBurn],
        });
        
        setAllowance(BigInt(result));
        console.log('Current allowance:', {
          token: selectedToken.symbol,
          allowance: result.toString(),
          required: (selectedToken.symbol === "$SYSTEM" ? systemApprovalAmount : selfApprovalAmount).toString()
        });
      } catch (error) {
        console.error('Error checking allowance:', error);
        setAllowance(0n);
      } finally {
        setIsCheckingAllowance(false);
      }
    };

    checkAllowance();
  }, [address, publicClient, selectedToken, systemApprovalAmount, selfApprovalAmount]);

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
    console.log('✅ CART FIXED: Infinite console loop should be resolved - if you see this once, the fix worked!');
    console.group('🚀 Cart Component Initialization');
    console.log('📋 Component Mounted:', new Date().toISOString());
    
    // Validate paymaster setup
    const paymasterConfig = validatePaymasterSetup();
    console.log('📋 Paymaster Config:', paymasterConfig);
    
    // Validate contract addresses
    console.log('📋 Contract Addresses:', {
      purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
      systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
      selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN
    });
    
    // Validate ABI
    console.log('📋 ABI Validation:', {
      purchaseBurnABI: {
        length: purchaseBurnABI.length,
        hasPurchaseArtifact: purchaseBurnABI.some(item => item.name === 'purchaseArtifact'),
        functions: purchaseBurnABI.filter(item => item.type === 'function').map(item => item.name)
      }
    });
    
    // Validate user state
    console.log('📋 User State:', {
      address: address,
      chainId: BASE_CHAIN_ID,
      selectedToken: selectedToken?.symbol
    });
    
    console.groupEnd();

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

  // RESTORED: ORIGINAL PURCHASE CALL LOGIC (for test)
const getPurchaseCall = useCallback(() => {
  try {
    // FIXED: Removed all console.log statements to prevent infinite render loops
    // Validate paymaster setup first
    const paymasterConfig = validatePaymasterSetup();
    if (!paymasterConfig.isValid) {
      throw new Error('Paymaster configuration is invalid');
    }

    // TODO: Temporarily disabled to prevent render loops
    // console.log('Starting getPurchaseCall with:', {
    //   productId,
    //   selectedToken,
    //   systemApprovalAmount: systemApprovalAmount.toString(),
    //   selfApprovalAmount: selfApprovalAmount.toString(),
    //   address
    // });

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
    if (typeof systemApprovalAmount !== 'bigint' || typeof selfApprovalAmount !== 'bigint') {
      console.error('Approval amounts are not BigInt:', {
        systemApprovalAmount,
        selfApprovalAmount
      });
      throw new Error('Invalid approval amounts: not BigInt');
    }

    const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
    // TODO: Temporarily disabled to prevent render loops
    // console.group('🏗️ Purchase Call Construction');
    // console.log('Purchase burn contract details:', {
    //   address: purchaseBurnAddress,
    //   isValidAddress: purchaseBurnAddress?.startsWith('0x') && purchaseBurnAddress.length === 42,
    //   abiValidation: {
    //     hasPurchaseArtifact: purchaseBurnABI.some(item => item.name === 'purchaseArtifact'),
    //     abiLength: purchaseBurnABI.length
    //   }
    // });

    // Use the already formatted approval amounts (BigInt, 18 decimals)
    const systemAmount = systemApprovalAmount;
    const selfAmount = selfApprovalAmount;
    const zeroAmount = 0n;

    // console.log('Purchase amount formatting:', {
    //   systemAmount: systemAmount.toString(),
    //   selfAmount: selfAmount.toString(),
    //   zeroAmount: zeroAmount.toString(),
    //   rawAmounts: {
    //     system: systemApprovalAmount,
    //     self: selfApprovalAmount
    //   },
    //   isBigInt: {
    //     system: typeof systemAmount === 'bigint',
    //     self: typeof selfAmount === 'bigint',
    //     zero: typeof zeroAmount === 'bigint'
    //   }
    // });

    const txCall = [
      selectedToken.symbol === "$SYSTEM"
        ? {
            address: purchaseBurnAddress,
            abi: purchaseBurnABI,
            functionName: "purchaseArtifact",
            args: [systemAmount.toString(), zeroAmount.toString(), productId],
          }
        : {
            address: purchaseBurnAddress,
            abi: purchaseBurnABI,
            functionName: "purchaseArtifact",
            args: [zeroAmount.toString(), selfAmount.toString(), productId],
          }
    ];
    return txCall;
  } catch (error) {
    logError(error, 'getPurchaseCall');
    throw error;
  }
}, [selectedToken, systemApprovalAmount, selfApprovalAmount, productId, address]);


  // For purchase only (approve step skipped for this test)
  // CACHE BUSTER: Force browser reload after fixing infinite console loops
  // TODO: Remove render logs that cause infinite loops
  // console.log('RENDER: selectedToken:', selectedToken);
  // console.log('RENDER: totalSystemPrice:', totalSystemPrice, 'totalSelfPrice:', totalSelfPrice);
  // console.log('RENDER: products:', products);
  // console.log('RENDER: address:', address);

  // For purchase
  const purchaseCalls = getPurchaseCall();
  // console.log('RENDER: <Transaction /> purchaseCalls:', JSON.stringify(purchaseCalls, null, 2));

  // Hardcoded test call for approve flow
  const testApproveCall = [{
    to: "0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21", // $SELF token address
    abi: [
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
    ],
    functionName: "approve",
    args: [
      "0x5CaD68445feAb8d96a8535B60CC3758B3139B3F7", // purchaseBurn contract
      "500000000000000000", // 0.5 $SELF
    ],
  }];

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Approve call object for Transaction - dynamically choose token based on selection
  const approveCalls = [
    {
      address: (selectedToken.symbol === "$SYSTEM" 
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN 
        : process.env.NEXT_PUBLIC_SELF_TOKEN) as `0x${string}`,
      abi: parsedErc20ABI,
      functionName: 'approve',
      args: [
        process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`, 
        selectedToken.symbol === "$SYSTEM" ? systemApprovalAmount : selfApprovalAmount
      ],
    },
  ];

    // determine how much allowance is required for the selected token
  const requiredApprovalAmount =
    selectedToken.symbol === "$SYSTEM"
      ? systemApprovalAmount
      : selfApprovalAmount;

  // has the user already approved at least that much?
  const needsApproval = allowance < requiredApprovalAmount;


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

          {/* Combined approval + purchase transaction */}
          <Transaction
            account={address?.toLowerCase() as `0x${string}`}
            chainId={BASE_CHAIN_ID}
            calls={needsApproval ? [...approveCalls, ...purchaseCalls] : purchaseCalls}
            isSponsored={true}
            onSuccess={async (response) => {
              setIsLoading(false);
              setIsSuccess(true);
              setApproveTxSuccess(true);
              
              // Update allowance state
              if (needsApproval) {
                const tokenAddress = selectedToken.symbol === "$SYSTEM" 
                  ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
                  : process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
                const purchaseBurn = process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`;
                if (publicClient && address) {
                  try {
                    const result = await publicClient.readContract({
                      address: tokenAddress,
                      abi: parsedErc20ABI,
                      functionName: 'allowance',
                      args: [address as `0x${string}`, purchaseBurn],
                    });
                    setAllowance(BigInt(result));
                  } catch (error) {
                    console.error('Error updating allowance after transaction:', error);
                  }
                }
              }
              
              console.group('✅ Combined Transaction Success');
              console.log('📋 Full Transaction Response:', response);
              console.log('📋 Approval + Purchase executed together');
              
              // Handle Account Abstraction (ERC-4337) transaction response
              if (response?.userOpHash) {
                console.log('📋 UserOperation Hash:', response.userOpHash);
                console.log('📋 This is the AA transaction identifier');
              }
              
              if (response?.transactionReceipts?.[0]) {
                const receipt = response.transactionReceipts[0];
                console.log('📋 Bundler Transaction Hash:', receipt.transactionHash);
                console.log('📋 Block Number:', receipt.blockNumber);
                console.log('📋 Status:', receipt.status);
                console.log('📋 Gas Used:', receipt.gasUsed);
                console.log('📋 To Address:', receipt.to);
                console.log('📋 From Address:', receipt.from);
                console.log('📋 Logs Count:', receipt.logs?.length);
                
                // Check if our contract was called
                const logs = receipt.logs || [];
                const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN;
                const contractLogs = logs.filter((log: any) => log.address?.toLowerCase() === purchaseBurnAddress?.toLowerCase());
                console.log('📋 Contract Logs:', contractLogs);
                console.log('📋 Contract Called:', contractLogs.length > 0 ? '✅ Yes' : '❌ No');
                
                if (contractLogs.length === 0) {
                  console.warn('⚠️ WARNING: Purchase burn contract was not called!');
                  console.warn('⚠️ This indicates the UserOperation did not include the contract call');
                }
                
                // Log the actual transaction hash that will appear on BaseScan
                console.log('📋 BaseScan Transaction URL:', `https://basescan.org/tx/${receipt.transactionHash}`);
                
                // Verify contract events
                const contractAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN;
                if (contractAddress) {
                  await verifyContractEvents(receipt.transactionHash, contractAddress, publicClient);
                }
              } else {
                console.warn('⚠️ No transaction receipt found in response');
                console.log('📋 Response structure:', Object.keys(response || {}));
              }
              console.groupEnd();

              console.log('Combined approval + purchase transaction succeeded');
              
              // Get transaction receipt for notifications
              const receipt = response?.transactionReceipts?.[0];
              
              // Send purchase notifications to fulfillment managers via API
              try {
                console.log('🚀 STARTING NOTIFICATION PROCESS - products:', products);
                console.log('🛒 Sending purchase notifications for', products.length, 'products');
                
                const notificationPromises = products.map(async (product) => {
                  console.log('🔔 Creating notification for product:', {
                    productName: product.name || product.title,
                    productId: product.id.toString(),
                    requiredToken: product.required_token,
                    buyerAddress: address
                  });
                  
                  console.log('🌐 Making API call to /api/notifications with data:', {
                    type: 'purchase_completed',
                    buyerAddress: address,
                    productName: product.name || product.title,
                    productId: product.id.toString(),
                    requiredToken: product.required_token,
                    transactionHash: receipt?.transactionHash
                  });

                  const response = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      type: 'purchase_completed',
                      buyerAddress: address,
                      productName: product.name || product.title,
                      productId: product.id.toString(),
                      requiredToken: product.required_token,
                      transactionHash: receipt?.transactionHash
                    })
                  });

                  console.log('🌐 API response status:', response.status);

                  if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to create notification:', errorData);
                    throw new Error(`Notification API error: ${errorData.error}`);
                  }

                  return response.json();
                });

                await Promise.all(notificationPromises);
                console.log('✅ All purchase notifications sent successfully');
              } catch (notificationError) {
                console.error('❌ Failed to send purchase notifications:', notificationError);
                // Don't block the purchase flow if notifications fail
              }
              
              // Clear the cart after successful purchase
              clearCart();
              closeCart();
              
              // TODO: Re-enable after debugging purchase notifications
              // Force a hard refresh to show updated balances
              // window.location.reload();
              console.log('🔍 Purchase complete - page refresh disabled for debugging');
            }}
            onError={(error) => {
              setIsLoading(false);
              setIsSuccess(false);
              setApproveTxSuccess(false);
              
              console.group('❌ Combined Transaction Error');
              console.error('📋 Error Details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
              });
              console.error('📋 Error Type:', typeof error);
              console.error('📋 Error Constructor:', error.constructor.name);
              console.groupEnd();

              console.error('Transaction error (approval + purchase):', error);
              handleTransactionError(error, 'approval + purchase').then(paymasterResult => {
                if (paymasterResult.isInfrastructureError && retryCount < MAX_RETRIES) {
                  console.log(`🔄 Retrying combined transaction (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                  setRetryCount(prev => prev + 1);
                  setIsRetrying(true);
                  
                  // Wait before retry
                  setTimeout(() => {
                    setIsRetrying(false);
                  }, paymasterResult.retryDelay);
                } else {
                  handleTransactionError(error, 'approval + purchase');
                }
              });
            }}
          >
            <TransactionButton
              text={isLoading ? "Processing..." : isSuccess ? "Success!" : needsApproval ? "Approve & Purchase" : "Purchase"}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              disabled={isLoading || isSuccess}
            />
            <TransactionSponsor />
            <TransactionStatus>
              <TransactionStatusLabel />
              <TransactionStatusAction />
            </TransactionStatus>
          </Transaction>
        </S.CartFooter>
      </S.CartContent>
    </S.CartOverlay>
  );
}
