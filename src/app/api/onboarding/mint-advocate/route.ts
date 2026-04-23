/**
 * API Route: Mint Advocate NFT
 * POST /api/onboarding/mint-advocate
 *
 * Mints 1 Advocate NFT to new users and auto-delegates for voting power.
 *
 * Security:
 * - Uses admin wallet (backend .env only)
 * - Validates wallet address format before minting
 * - Auto-delegates NFT to recipient for immediate voting power
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createWalletClient,
  parseAbi,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createConfiguredPublicClient, getWriteTransport } from '@/utils/rpcClient';

export const runtime = 'nodejs';
export const maxDuration = 60;

// AdvocateMembership ABI (ERC721Votes, soulbound)
const ADVOCATE_ABI = parseAbi([
  'function mint(address to, uint8 memberType, string uri) external',
  'function balanceOf(address owner) external view returns (uint256)',
]);

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}` | undefined;

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();

    // Validate required parameters
    if (!walletAddress) {
      console.error('❌ Mint Advocate API: No wallet address provided');
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 },
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      console.error('❌ Mint Advocate API: Invalid wallet address format:', walletAddress);
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    if (!ADVOCATE_ADDRESS) {
      console.error('❌ Mint Advocate API: NEXT_PUBLIC_ADVOCATE not configured');
      return NextResponse.json(
        { success: false, error: 'Advocate contract not configured' },
        { status: 500 },
      );
    }

    console.log('🎖️ Mint Advocate API: Starting Advocate NFT mint process...');
    console.log(`   Recipient: ${walletAddress}`);
    console.log(`   Amount: 1 NFT`);

    // Get backend admin wallet
    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

    if (!ADMIN_PRIVATE_KEY) {
      console.error('❌ Mint Advocate API: No admin private key configured');
      console.error('   Set POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY in .env');
      return NextResponse.json(
        { success: false, error: 'Server configuration error - admin key missing' },
        { status: 500 },
      );
    }

    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
    console.log(`🔑 Mint Advocate API: Using admin wallet: ${adminAccount.address}`);

    // Create clients — reads use Coinbase RPC, writes use public RPC (Coinbase rejects eth_sendRawTransaction)
    const publicClient = createConfiguredPublicClient();

    const walletClient = createWalletClient({
      account: adminAccount,
      chain: base,
      transport: getWriteTransport(),
    });

    // Check if user already has Advocate NFTs
    console.log('🔍 Mint Advocate API: Checking current balance...');
    const currentBalance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: ADVOCATE_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    });

    if (currentBalance > 0n) {
      console.log(`ℹ️ Mint Advocate API: User already has ${currentBalance} Advocate NFT(s)`);
      return NextResponse.json({
        success: true,
        alreadyHadNFT: true,
        currentBalance: currentBalance.toString(),
        message: `User already has ${currentBalance} Advocate NFT(s)`,
      });
    }

    // Mint 1 Advocate NFT — MemberType.STANDARD = 0
    console.log('📤 Mint Advocate API: Sending mint transaction...');
    const mintHash = await walletClient.writeContract({
      address: ADVOCATE_ADDRESS,
      abi: ADVOCATE_ABI,
      functionName: 'mint',
      args: [walletAddress as `0x${string}`, 0, ''],
    });

    console.log(`   ⏳ Mint transaction hash: ${mintHash}`);

    // Wait for mint confirmation
    const mintReceipt = await publicClient.waitForTransactionReceipt({
      hash: mintHash,
      timeout: 60_000,
    });

    if (mintReceipt.status !== 'success') {
      console.error('❌ Mint Advocate API: Mint transaction failed');
      return NextResponse.json(
        {
          success: false,
          error: 'Advocate NFT minting transaction failed',
          transactionHash: mintHash,
        },
        { status: 500 },
      );
    }

    console.log(`✅ Mint Advocate API: 1 Advocate NFT minted successfully!`);
    console.log(`   Transaction: ${mintHash}`);
    console.log(`   Block: ${mintReceipt.blockNumber}`);

    // V2 contract auto-delegates to recipient on mint — voting power is live immediately.
    return NextResponse.json({
      success: true,
      mintTransactionHash: mintHash,
      blockNumber: mintReceipt.blockNumber.toString(),
      gasUsed: mintReceipt.gasUsed.toString(),
      amount: '1',
    });

  } catch (error) {
    console.error('❌ Mint Advocate API: Unexpected error:', error);

    let errorMessage = 'Advocate NFT minting failed';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
