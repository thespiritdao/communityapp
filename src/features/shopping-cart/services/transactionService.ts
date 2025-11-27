// src/features/shopping-cart/services/transactionService.ts
import type { ICartProduct } from '../models';
import type { Token } from '../hooks/useCartCalculations';
import {
  validatePaymasterSetup,
  parsedErc20ABI,
} from '../hooks/useCartValidation';

// Re-export ABI types needed for transactions
const purchaseBurnABI = require('src/abis/purchaseBurnABI.json');
const purchaseRouterABI = require('src/abis/PurchaseRouter.json');
const purchaseRouterDecentralizedABI = require('src/abis/PurchaseRouterDecentralized.json');

export interface TransactionCall {
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args: any[];
}

export interface TransactionData {
  approveCalls: TransactionCall[];
  purchaseCalls: TransactionCall[];
  totalCalls: TransactionCall[];
  needsApproval: boolean;
}

/**
 * Error logging utility for transaction operations
 * CRITICAL: Must match the exact logging logic from Cart.tsx
 */
const logError = async (error: unknown, context: string) => {
  try {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    };

    console.error(`[${timestamp}] Transaction Error in ${context}:`, errorLog);

    // Store in localStorage for debugging (with rate limiting)
    const ERROR_LOG_KEY = 'commapp_transaction_error_logs';
    const MAX_LOGS = 50;

    const existingLogs = JSON.parse(
      localStorage.getItem(ERROR_LOG_KEY) || '[]',
    );
    existingLogs.push(errorLog);

    if (existingLogs.length > MAX_LOGS) {
      existingLogs.splice(0, existingLogs.length - MAX_LOGS);
    }

    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existingLogs));
  } catch (loggingError) {
    console.error('Failed to log transaction error:', loggingError);
  }
};

/**
 * Generate approval transaction calls
 * CRITICAL: Must match exact logic from Cart.tsx
 */
export const generateApprovalCalls = (
  systemApprovalAmount: bigint,
  selfApprovalAmount: bigint,
  selectedToken: Token,
  approvalContractAddress: string,
): TransactionCall[] => {
  const approveCalls: TransactionCall[] = [];

  // Use the contract address passed in (which may be overridden for treasury routing)
  const { isDecentralized: approvalIsDecentralized } = validatePaymasterSetup();

  if (approvalIsDecentralized) {
    // For decentralized router, approve both tokens since contract tries to transfer from both
    if (systemApprovalAmount > BigInt(0)) {
      approveCalls.push({
        address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'approve',
        args: [
          approvalContractAddress as `0x${string}`,
          systemApprovalAmount.toString(),
        ],
      });
    }
    if (selfApprovalAmount > BigInt(0)) {
      approveCalls.push({
        address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'approve',
        args: [
          approvalContractAddress as `0x${string}`,
          selfApprovalAmount.toString(),
        ],
      });
    }
  } else {
    // For non-decentralized contracts, only approve the selected token
    approveCalls.push({
      address: (selectedToken.symbol === '$SYSTEM'
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
        : process.env.NEXT_PUBLIC_SELF_TOKEN) as `0x${string}`,
      abi: parsedErc20ABI,
      functionName: 'approve',
      args: [
        approvalContractAddress as `0x${string}`,
        (selectedToken.symbol === '$SYSTEM'
          ? systemApprovalAmount
          : selfApprovalAmount
        ).toString(),
      ],
    });
  }

  return approveCalls;
};

/**
 * Generate purchase transaction calls
 * CRITICAL: Must match exact logic from getPurchaseCall in Cart.tsx
 */
export const generatePurchaseCalls = (
  selectedToken: Token,
  systemApprovalAmount: bigint,
  selfApprovalAmount: bigint,
  productId: string,
  address: string,
  products: ICartProduct[],
  useFallbackRouting = false,
): TransactionCall[] => {
  try {
    // Validate paymaster setup first
    const paymasterConfig = validatePaymasterSetup();
    if (!paymasterConfig.isValid) {
      throw new Error('Paymaster configuration is invalid');
    }

    // Calculate amounts for single token payment
    const zeroAmount = BigInt(0);
    const systemAmount =
      selectedToken.symbol === '$SYSTEM' ? systemApprovalAmount : zeroAmount;
    const selfAmount =
      selectedToken.symbol === '$SELF' ? selfApprovalAmount : zeroAmount;

    // Check if any products need treasury routing
    const needsDecentralizedRouting = products.some(
      (product) =>
        product.fund_destination_type === 'pod_treasury' ||
        product.fund_destination_type === 'wallet',
    );

    // Log debug info
    console.log('🔧 Purchase call generation:', {
      selectedToken: selectedToken.symbol,
      systemAmount: systemAmount.toString(),
      selfAmount: selfAmount.toString(),
      productId,
      useFallbackRouting,
      needsDecentralizedRouting,
      productRoutingTypes: products.map((p) => ({
        id: p.id,
        type: p.fund_destination_type,
      })),
    });

    // Override router selection if products need treasury routing
    let {
      contractAddress,
      useRouter,
      isDecentralized: routerIsDecentralized,
    } = validatePaymasterSetup();

    if (needsDecentralizedRouting && !routerIsDecentralized) {
      // Force use of decentralized router if products need treasury routing
      const decentralizedAddress =
        process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED;
      if (decentralizedAddress) {
        console.log(
          '🔄 Switching to decentralized router for treasury routing:',
          {
            originalContract: contractAddress,
            decentralizedContract: decentralizedAddress,
            reason: 'Products require treasury/wallet routing',
          },
        );
        contractAddress = decentralizedAddress;
        routerIsDecentralized = true;
        useRouter = true;
      } else {
        console.warn(
          '⚠️ Products need treasury routing but NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED not configured!',
        );
      }
    }
    const selectedABI = routerIsDecentralized
      ? purchaseRouterDecentralizedABI
      : useRouter
        ? purchaseRouterABI
        : purchaseBurnABI;

    // For decentralized router, we need to get the product's fund destination from the first product
    let fundDestinationType = 0; // Default to BURN
    let destinationAddress = '0x0000000000000000000000000000000000000000';
    let podId = '';

    if (routerIsDecentralized && products && products.length > 0) {
      const firstProduct = products[0];
      // Map fund_destination_type to enum values
      const typeMap = {
        burn: 0,
        wallet: 1,
        pod_treasury: 2,
      };

      if (
        firstProduct.fund_destination_type &&
        typeMap[firstProduct.fund_destination_type as keyof typeof typeMap] !==
          undefined
      ) {
        fundDestinationType =
          typeMap[firstProduct.fund_destination_type as keyof typeof typeMap];

        // Handle destination address based on type
        if (firstProduct.fund_destination_type === 'pod_treasury') {
          // For pod treasury, MUST use destination_address
          destinationAddress =
            firstProduct.destination_address || destinationAddress;
          podId = firstProduct.pod_id || '';
        } else if (firstProduct.fund_destination_type === 'wallet') {
          // For wallet, use creator_wallet
          destinationAddress =
            firstProduct.creator_wallet ||
            firstProduct.destination_address ||
            destinationAddress;
          podId = '';
        } else {
          // For burn, use zero address
          destinationAddress = '0x0000000000000000000000000000000000000000';
          podId = '';
        }
      }

      console.log('🎯 Fund routing for decentralized purchase:', {
        productId: firstProduct.id,
        fund_destination_type: firstProduct.fund_destination_type,
        fundDestinationType,
        destinationAddress,
        podId,
      });
    }

    // Debug contract call amounts
    console.log('📞 Contract Call Debug:', {
      contractAddress,
      isDecentralized: routerIsDecentralized,
      selectedToken: selectedToken.symbol,
      systemAmount: systemAmount.toString(),
      selfAmount: selfAmount.toString(),
      productId,
      fundDestinationType,
      destinationAddress,
      podId,
      singleTokenPurchase: {
        usingSystem: selectedToken.symbol === '$SYSTEM',
        usingSelf: selectedToken.symbol === '$SELF',
        willPassSystemAmount: systemAmount.toString() !== '0',
        willPassSelfAmount: selfAmount.toString() !== '0',
      },
    });

    const txCall = routerIsDecentralized
      ? [
          {
            address: contractAddress as `0x${string}`,
            abi: selectedABI,
            functionName: 'purchaseWithExplicitDestination',
            args: [
              systemAmount.toString(),
              selfAmount.toString(),
              productId,
              fundDestinationType,
              destinationAddress,
              podId,
            ],
          },
        ]
      : useRouter
        ? [
            {
              address: contractAddress as `0x${string}`,
              abi: selectedABI,
              functionName: 'purchaseWithRouting',
              args: [systemAmount.toString(), selfAmount.toString(), productId],
            },
          ]
        : [
            // For PurchaseBurn contracts, pass amounts based on selected token
            selectedToken.symbol === '$SYSTEM'
              ? {
                  address: contractAddress as `0x${string}`,
                  abi: selectedABI,
                  functionName: 'purchaseArtifact',
                  args: [
                    systemAmount.toString(),
                    zeroAmount.toString(),
                    productId,
                  ],
                }
              : {
                  address: contractAddress as `0x${string}`,
                  abi: selectedABI,
                  functionName: 'purchaseArtifact',
                  args: [
                    zeroAmount.toString(),
                    selfAmount.toString(),
                    productId,
                  ],
                },
          ];

    return txCall;
  } catch (error) {
    logError(error, 'generatePurchaseCalls');
    throw error;
  }
};

/**
 * Prepare complete transaction data for OnchainKit Transaction component
 * CRITICAL: This prepares data but does NOT interact with OnchainKit components
 */
export const prepareTransactionData = (
  selectedToken: Token,
  systemApprovalAmount: bigint,
  selfApprovalAmount: bigint,
  needsApproval: boolean,
  productId: string,
  address: string,
  products: ICartProduct[],
  useFallbackRouting = false,
): TransactionData => {
  try {
    // CRITICAL: Check if any products need treasury routing FIRST
    const needsDecentralizedRouting =
      products &&
      products.some(
        (product) =>
          product.fund_destination_type === 'pod_treasury' ||
          product.fund_destination_type === 'wallet',
      );

    // Get contract configuration with potential override for treasury routing
    let {
      contractAddress: approvalContractAddress,
      isDecentralized: routerIsDecentralized,
    } = validatePaymasterSetup();

    if (needsDecentralizedRouting && !routerIsDecentralized) {
      // Override to use decentralized router for both approval and purchase
      const decentralizedAddress =
        process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED;
      if (decentralizedAddress) {
        console.log(
          '🔄 Using decentralized router for approvals due to treasury routing:',
          {
            originalContract: approvalContractAddress,
            decentralizedContract: decentralizedAddress,
            reason: 'Products require treasury/wallet routing',
          },
        );
        approvalContractAddress = decentralizedAddress;
      } else {
        console.warn(
          '⚠️ Products need treasury routing but NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED not configured for approvals!',
        );
      }
    }

    // Generate approval calls if needed (using potentially overridden contract address)
    const approveCalls = needsApproval
      ? generateApprovalCalls(
          systemApprovalAmount,
          selfApprovalAmount,
          selectedToken,
          approvalContractAddress,
        )
      : [];

    // Generate purchase calls if products exist
    const purchaseCalls =
      products && products.length > 0
        ? generatePurchaseCalls(
            selectedToken,
            systemApprovalAmount,
            selfApprovalAmount,
            productId,
            address,
            products,
            useFallbackRouting,
          )
        : [];

    // Combine calls
    const totalCalls = needsApproval
      ? [...approveCalls, ...purchaseCalls]
      : purchaseCalls;

    console.log('📋 Transaction Data Prepared:', {
      needsApproval,
      needsDecentralizedRouting,
      approvalContractAddress,
      totalCalls: totalCalls.length,
      approveCalls: approveCalls.length,
      purchaseCalls: purchaseCalls.length,
      account: address?.toLowerCase(),
      isSponsored: true,
    });

    return {
      approveCalls,
      purchaseCalls,
      totalCalls,
      needsApproval,
    };
  } catch (error) {
    logError(error, 'prepareTransactionData');
    throw error;
  }
};

/**
 * Utility to format amounts for display in transaction debugging
 */
export const formatTransactionAmounts = (
  systemAmount: bigint,
  selfAmount: bigint,
  selectedToken: Token,
) => {
  return {
    systemAmount: systemAmount.toString(),
    selfAmount: selfAmount.toString(),
    selectedToken: selectedToken.symbol,
    systemIsZero: systemAmount === BigInt(0),
    selfIsZero: selfAmount === BigInt(0),
    willPassSystemAmount: systemAmount.toString() !== '0',
    willPassSelfAmount: selfAmount.toString() !== '0',
  };
};
