import type { ICartProduct } from '../../models';

const purchaseBurnABI = require('src/abis/purchaseBurnABI.json');
const purchaseRouterABI = require('src/abis/PurchaseRouter.json');
const purchaseRouterDecentralizedABI = require('src/abis/PurchaseRouterDecentralized.json');

export interface PurchaseConfig {
  productId: string;
  selectedToken: { symbol: string };
  systemAmount: bigint;
  selfAmount: bigint;
  address: string;
  products: ICartProduct[];
  useFallbackRouting?: boolean;
}

export interface PaymasterSetup {
  isValid: boolean;
  contractAddress: string;
  useRouter: boolean;
  isDecentralized: boolean;
}

export function validatePaymasterSetup(): PaymasterSetup {
  const purchaseRouterAddress = process.env.NEXT_PUBLIC_PURCHASE_ROUTER;
  const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN;
  const decentralizedRouterAddress =
    process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED;
  const useDecentralized =
    process.env.NEXT_PUBLIC_USE_DECENTRALIZED_ROUTER === 'true';

  if (useDecentralized) {
    return {
      isValid: Boolean(decentralizedRouterAddress),
      contractAddress: decentralizedRouterAddress || '',
      useRouter: true,
      isDecentralized: true,
    };
  }

  const useRouter = Boolean(purchaseRouterAddress);
  const contractAddress = useRouter
    ? purchaseRouterAddress
    : purchaseBurnAddress;

  return {
    isValid: Boolean(contractAddress),
    contractAddress: contractAddress || '',
    useRouter,
    isDecentralized: false,
  };
}

export interface FundRoutingInfo {
  fundDestinationType: number;
  destinationAddress: string;
  podId: string;
}

/**
 * @param treasuryOverrides podId → treasury address resolved live from the
 *   router's treasury factory. PurchaseRouterDecentralized requires the
 *   destination to equal `treasuryFactory.getTreasuryForPod(podId)` exactly,
 *   and `products.destination_address` goes stale whenever a pod redeploys its
 *   treasury or the router is repointed at a different factory — which reverts
 *   the purchase with "Treasury address mismatch". Prefer the live value.
 */
export function determineFundRouting(
  products: ICartProduct[],
  userAddress: string,
  useFallbackRouting: boolean,
  treasuryOverrides?: Record<string, string>,
): FundRoutingInfo {
  const typeMap: Record<string, number> = {
    burn: 0,
    wallet: 1,
    pod_treasury: 2,
  };

  let fundDestinationType = 0;
  let destinationAddress = '0x0000000000000000000000000000000000000000';
  let podId = '';

  if (products && products.length > 0) {
    const firstProduct = products[0];

    if (
      useFallbackRouting &&
      firstProduct.fund_destination_type === 'pod_treasury'
    ) {
      console.warn('🔄 Using fallback routing to creator wallet');
      fundDestinationType = 1;
      destinationAddress = firstProduct.creator_wallet || userAddress;
      podId = '';
    } else {
      fundDestinationType = typeMap[(firstProduct.fund_destination_type || 'burn') as string] ?? 0;

      if (firstProduct.fund_destination_type === 'pod_treasury') {
        if (!firstProduct.destination_address || !firstProduct.pod_id) {
          console.error(
            '⚠️ Pod treasury routing missing data, using wallet fallback',
          );
          fundDestinationType = 1;
          destinationAddress = firstProduct.creator_wallet || userAddress;
          podId = '';
        } else {
          podId = firstProduct.pod_id;
          // Live treasury address wins over the stored one (see doc comment).
          const resolved = treasuryOverrides?.[podId];
          if (resolved && resolved !== firstProduct.destination_address) {
            console.warn(
              `🏛️ Treasury for pod ${podId} resolved on-chain to ${resolved}; stored destination_address is ${firstProduct.destination_address}. Using the on-chain value.`,
            );
          }
          destinationAddress = resolved || firstProduct.destination_address;
        }
      } else if (firstProduct.fund_destination_type === 'wallet') {
        // For wallet routing, use creator_wallet
        destinationAddress = firstProduct.creator_wallet || userAddress;
        podId = '';
      } else {
        // For burn or unknown, use burn address
        destinationAddress = '0x0000000000000000000000000000000000000000';
        podId = '';
      }
    }
  }

  return { fundDestinationType, destinationAddress, podId };
}

export function buildPurchaseCall(config: PurchaseConfig) {
  const paymasterConfig = validatePaymasterSetup();

  if (!paymasterConfig.isValid) {
    throw new Error('Invalid paymaster configuration');
  }

  if (!config.productId) {
    throw new Error('Invalid product ID');
  }

  const formattedAddress = config.address?.toLowerCase() as `0x${string}`;
  if (
    !formattedAddress ||
    !formattedAddress.startsWith('0x') ||
    formattedAddress.length !== 42
  ) {
    throw new Error('Invalid user address');
  }

  const { contractAddress, useRouter, isDecentralized } = paymasterConfig;
  const selectedABI = isDecentralized
    ? purchaseRouterDecentralizedABI
    : useRouter
      ? purchaseRouterABI
      : purchaseBurnABI;

  if (isDecentralized) {
    const routing = determineFundRouting(
      config.products,
      config.address,
      config.useFallbackRouting || false,
    );

    // CONTRACT FIXED: Now we can use purchaseWithExplicitDestination properly
    // This ensures destinations are set correctly even if not pre-configured in contract
    console.log(
      '✅ Using purchaseWithExplicitDestination (contract fixed - no buyer permission check)',
    );
    console.log('📋 Routing details:', {
      fundDestinationType: routing.fundDestinationType,
      destinationAddress: routing.destinationAddress,
      podId: routing.podId,
      originalProductType: config.products[0]?.fund_destination_type,
    });

    return [
      {
        address: contractAddress as `0x${string}`,
        abi: selectedABI,
        functionName: 'purchaseWithExplicitDestination',
        args: [
          config.systemAmount.toString(),
          config.selfAmount.toString(),
          config.productId,
          routing.fundDestinationType,
          routing.destinationAddress,
          routing.podId,
        ],
      },
    ];
  } else if (useRouter) {
    return [
      {
        address: contractAddress as `0x${string}`,
        abi: selectedABI,
        functionName: 'purchaseArtifactRouter',
        args: [
          config.systemAmount.toString(),
          config.selfAmount.toString(),
          config.productId,
          formattedAddress,
        ],
      },
    ];
  } else {
    return [
      {
        address: contractAddress as `0x${string}`,
        abi: selectedABI,
        functionName: 'purchaseArtifact',
        args: [
          config.systemAmount.toString(),
          config.selfAmount.toString(),
          config.productId,
        ],
      },
    ];
  }
}

export async function verifyContractEvents(
  receipt: any,
  contractAddress: string,
): Promise<boolean> {
  try {
    console.group('📋 Contract Event Verification');
    console.log('Receipt:', receipt);

    const contractLogs =
      receipt.logs?.filter(
        (log: any) =>
          log.contractAddress?.toLowerCase() === contractAddress.toLowerCase(),
      ) || [];

    console.log(
      `📍 Found ${contractLogs.length} logs from contract ${contractAddress}`,
    );

    if (contractLogs.length > 0) {
      const purchaseEvents = contractLogs.filter((log: any) => {
        try {
          const purchaseEventSignatures = [
            '0x52b28c2c6db0ef7d180f694a2c0d7e4e9ce0b0e3c9c6a8e5ae452d4d1a6b8af7',
            '0xfd14e2e3596a20450defb59a35bf6c7db343dc86ba781cd612c173e92b45f8ee',
          ];

          if (log.topics && log.topics.length > 0) {
            const eventTopic = log.topics[0];
            return purchaseEventSignatures.includes(eventTopic);
          }
        } catch (error) {
          console.error('Error checking event signature:', error);
          return true;
        }
      });

      const eventName = contractAddress.includes('Router')
        ? 'PurchaseCompleted'
        : 'PurchaseArtifact';
      console.log(`📋 ${eventName} Events:`, purchaseEvents.length);

      if (purchaseEvents.length > 0) {
        console.log(`✅ ${eventName} event found!`);
        console.log('📋 Event Details:', purchaseEvents[0]);
      }
    }

    console.groupEnd();
    return contractLogs.length > 0;
  } catch (error) {
    console.error('❌ Error verifying contract events:', error);
    return false;
  }
}
