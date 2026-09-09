import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { requireWalletMatch } from '@/lib/apiPodGuard';

export const runtime = 'nodejs';

const PURCHASE_ROUTER_DECENTRALIZED_ABI = [
  {
    name: 'setProductDestination',
    type: 'function',
    inputs: [
      { name: 'productId', type: 'string' },
      { name: 'destinationType', type: 'uint8' },
      { name: 'destinationAddress', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'hasPodManagementPermission',
    type: 'function',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'purchaseWithExplicitDestination',
    type: 'function',
    inputs: [
      { name: 'systemAmount', type: 'uint256' },
      { name: 'selfAmount', type: 'uint256' },
      { name: 'productId', type: 'string' },
      { name: 'destinationType', type: 'uint8' },
      { name: 'destinationAddress', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const {
      productId,
      fundDestinationType,
      destinationAddress,
      podId,
      userAddress,
    } = await request.json();

    if (!productId || !fundDestinationType || !userAddress) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: productId, fundDestinationType, userAddress',
        },
        { status: 400 },
      );
    }

    // userAddress must be the authenticated caller. This route never accepts
    // a private key: it only prepares calldata for the caller's own wallet.
    const walletOrDenied = requireWalletMatch(request, userAddress);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    console.log(
      '🎯 DECENTRALIZED: User setting their own product destination:',
      {
        productId,
        fundDestinationType,
        destinationAddress,
        podId,
        userAddress,
      },
    );

    // Validate environment variables
    const purchaseRouterAddress = process.env
      .NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}`;

    if (!purchaseRouterAddress) {
      return NextResponse.json(
        { error: 'Decentralized purchase router contract not configured' },
        { status: 500 },
      );
    }

    // Create clients
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // Map destination types to enum values
    const destinationTypeMap = {
      burn: 0,
      wallet: 1,
      pod_treasury: 2,
    };

    const destinationTypeEnum =
      destinationTypeMap[
        fundDestinationType as keyof typeof destinationTypeMap
      ];
    if (destinationTypeEnum === undefined) {
      return NextResponse.json(
        { error: 'Invalid fund destination type' },
        { status: 400 },
      );
    }

    // Validation based on destination type
    if (fundDestinationType === 'wallet') {
      if (destinationAddress?.toLowerCase() !== userAddress.toLowerCase()) {
        return NextResponse.json(
          { error: 'Wallet destination must be your own address' },
          { status: 400 },
        );
      }
    } else if (fundDestinationType === 'pod_treasury') {
      if (!podId) {
        return NextResponse.json(
          { error: 'Pod ID required for treasury destination' },
          { status: 400 },
        );
      }

      // Check if user has pod management permission
      const hasPermission = await publicClient.readContract({
        address: purchaseRouterAddress,
        abi: PURCHASE_ROUTER_DECENTRALIZED_ABI,
        functionName: 'hasPodManagementPermission',
        args: [userAddress as `0x${string}`, podId],
      });

      if (!hasPermission) {
        return NextResponse.json(
          {
            error:
              "You do not have permission to manage this pod's treasury routing",
          },
          { status: 403 },
        );
      }

      console.log('✅ User has pod management permission for:', podId);
    }

    // Return transaction data for the caller's own wallet to execute.
    return NextResponse.json({
      success: true,
      requiresUserTransaction: true,
      contractAddress: purchaseRouterAddress,
      functionName: 'setProductDestination',
      args: [
        productId,
        destinationTypeEnum,
        (destinationAddress ||
          '0x0000000000000000000000000000000000000000') as `0x${string}`,
        podId || '',
      ],
      abi: PURCHASE_ROUTER_DECENTRALIZED_ABI,
      message: 'Transaction data ready for user execution',
    });
  } catch (error) {
    console.error('❌ Error setting product destination:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to set product destination',
      },
      { status: 500 },
    );
  }
}

// GET endpoint to check permissions without executing transactions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');
    const podId = searchParams.get('podId');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'userAddress parameter required' },
        { status: 400 },
      );
    }

    const purchaseRouterAddress = process.env
      .NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}`;

    if (!purchaseRouterAddress) {
      return NextResponse.json(
        { error: 'Decentralized purchase router contract not configured' },
        { status: 500 },
      );
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const permissions: any = {
      userAddress,
      canSetWalletDestination: true, // Anyone can set their own wallet
      canBurn: true, // Anyone can set burn destination
    };

    if (podId) {
      // Check specific pod permission
      const hasPermission = await publicClient.readContract({
        address: purchaseRouterAddress,
        abi: PURCHASE_ROUTER_DECENTRALIZED_ABI,
        functionName: 'hasPodManagementPermission',
        args: [userAddress as `0x${string}`, podId],
      });

      permissions.podId = podId;
      permissions.canSetPodTreasuryDestination = hasPermission;
    }

    return NextResponse.json({
      success: true,
      permissions,
    });
  } catch (error) {
    console.error('❌ Error checking permissions:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check permissions',
      },
      { status: 500 },
    );
  }
}
