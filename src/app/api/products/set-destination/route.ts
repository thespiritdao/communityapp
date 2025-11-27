import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const PURCHASE_ROUTER_ABI = [
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
    name: 'setTreasuryAuthorization',
    type: 'function',
    inputs: [
      { name: 'treasury', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const { productId, fundDestinationType, destinationAddress, podId } =
      await request.json();

    if (!productId || !fundDestinationType) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, fundDestinationType' },
        { status: 400 },
      );
    }

    console.log('🎯 Setting product destination in smart contract:', {
      productId,
      fundDestinationType,
      destinationAddress,
      podId,
    });

    // Validate environment variables
    const purchaseRouterAddress = process.env
      .NEXT_PUBLIC_PURCHASE_ROUTER as `0x${string}`;
    const adminPrivateKey = process.env.PURCHASE_ROUTER_ADMIN_KEY;

    if (!purchaseRouterAddress) {
      return NextResponse.json(
        { error: 'Purchase router contract not configured' },
        { status: 500 },
      );
    }

    if (!adminPrivateKey) {
      return NextResponse.json(
        { error: 'Admin private key not configured' },
        { status: 500 },
      );
    }

    // Create clients
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
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

    // If pod treasury, ensure treasury is authorized first
    if (fundDestinationType === 'pod_treasury' && destinationAddress) {
      console.log('🏦 Authorizing treasury address:', destinationAddress);

      try {
        const authorizeTxHash = await walletClient.writeContract({
          address: purchaseRouterAddress,
          abi: PURCHASE_ROUTER_ABI,
          functionName: 'setTreasuryAuthorization',
          args: [destinationAddress as `0x${string}`, true],
        });

        console.log('🏦 Treasury authorization transaction:', authorizeTxHash);

        // Wait for authorization transaction to be mined
        await publicClient.waitForTransactionReceipt({ hash: authorizeTxHash });
        console.log('✅ Treasury authorized successfully');
      } catch (authError) {
        console.error('❌ Failed to authorize treasury:', authError);
        return NextResponse.json(
          { error: 'Failed to authorize treasury contract' },
          { status: 500 },
        );
      }
    }

    // Set product destination
    console.log('🎯 Setting product destination:', {
      productId,
      destinationTypeEnum,
      destinationAddress:
        destinationAddress || '0x0000000000000000000000000000000000000000',
      podId: podId || '',
    });

    const txHash = await walletClient.writeContract({
      address: purchaseRouterAddress,
      abi: PURCHASE_ROUTER_ABI,
      functionName: 'setProductDestination',
      args: [
        productId,
        destinationTypeEnum,
        (destinationAddress ||
          '0x0000000000000000000000000000000000000000') as `0x${string}`,
        podId || '',
      ],
    });

    console.log('🎯 Product destination transaction:', txHash);

    // Wait for transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log('✅ Product destination set successfully:', receipt);

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
      blockNumber: receipt.blockNumber.toString(),
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
