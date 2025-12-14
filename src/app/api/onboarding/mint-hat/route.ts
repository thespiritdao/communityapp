/**
 * API Route: Mint Beta Tester Hat
 * POST /api/onboarding/mint-hat
 *
 * Mints Beta Tester or Executive Leader hat to new users.
 *
 * Two modes:
 * 1. Smart Contract (PREFERRED) - Zero gas costs via Coinbase Paymaster
 * 2. EOA Fallback - Uses admin wallet if contract not deployed
 *
 * Security:
 * - Contract mode: No private keys needed, gas sponsored by paymaster
 * - EOA mode: Admin private key in backend .env only
 * - Validates wallet address format before minting
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  getContract,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACT_ADDRESSES, HAT_IDS } from '@/config/contracts';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================
// CONTRACT MODE (PREFERRED - Gas Free via Paymaster)
// ============================================================

const HAT_MINTER_ABI = parseAbi([
  'function mintBetaTesterHat(address recipient) external returns (bool)',
  'function mintExecutiveLeaderHat(address recipient) external returns (bool)',
  'function hasAdminHat() external view returns (bool)',
  'function hasBetaTesterHat(address user) external view returns (bool)',
  'function hasExecutiveLeaderHat(address user) external view returns (bool)',
]);

const HAT_MINTER_CONTRACT = process.env.NEXT_PUBLIC_HAT_MINTER as `0x${string}` | undefined;

// ============================================================
// EOA MODE (FALLBACK - Requires Gas)
// ============================================================

// Minimal Hats ABI for mintHat
const HATS_MINT_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'mintHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    name: 'isWearerOfHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, isFirstUser } = await request.json();

    // Validate required parameters
    if (!walletAddress) {
      console.error('❌ Mint Hat API: No wallet address provided');
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 },
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      console.error('❌ Mint Hat API: Invalid wallet address format:', walletAddress);
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    console.log('🎩 Mint Hat API: Starting hat mint process...');
    console.log(`   Recipient: ${walletAddress}`);
    console.log(`   First user: ${isFirstUser}`);

    // ============================================================
    // TRY CONTRACT MODE FIRST (GAS FREE)
    // ============================================================

    if (HAT_MINTER_CONTRACT) {
      console.log('✅ Mint Hat API: Using HatMinter contract (gas sponsored)');
      console.log(`   Contract: ${HAT_MINTER_CONTRACT}`);

      try {
        const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

        const publicClient = createPublicClient({
          chain: base,
          transport: http(RPC_URL),
        });

        // Read-only contract for checking state
        const hatMinterRead = getContract({
          address: HAT_MINTER_CONTRACT,
          abi: HAT_MINTER_ABI,
          client: publicClient,
        });

        // Check if user already has the hat
        const alreadyHasHat = isFirstUser
          ? await hatMinterRead.read.hasExecutiveLeaderHat([walletAddress as `0x${string}`])
          : await hatMinterRead.read.hasBetaTesterHat([walletAddress as `0x${string}`]);

        if (alreadyHasHat) {
          console.log(`ℹ️ Mint Hat API: User already has ${isFirstUser ? 'Executive Leader' : 'Beta Tester'} hat`);
          return NextResponse.json({
            success: true,
            alreadyHadHat: true,
            message: `User already wears ${isFirstUser ? 'Executive Leader' : 'Beta Tester'} hat`,
            mode: 'contract',
          });
        }

        // Verify contract has admin hat
        const contractHasAdminHat = await hatMinterRead.read.hasAdminHat();
        if (!contractHasAdminHat) {
          console.warn('⚠️ Mint Hat API: Contract does not have admin hat');
          console.warn('   You need to mint Executive Pod Leader hat to the contract:');
          console.warn(`   Contract address: ${HAT_MINTER_CONTRACT}`);
          console.warn('   Falling back to EOA mode');
          // Fall through to EOA mode
        } else {
          // Get backend wallet to authorize the transaction
          const BACKEND_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

          if (!BACKEND_PRIVATE_KEY) {
            console.warn('⚠️ Mint Hat API: No backend private key for contract calls, falling back to EOA mode');
          } else {
            const backendAccount = privateKeyToAccount(BACKEND_PRIVATE_KEY as `0x${string}`);

            console.log(`🔑 Mint Hat API: Using backend wallet: ${backendAccount.address}`);

            // Create wallet client for writing
            const walletClient = createWalletClient({
              account: backendAccount,
              chain: base,
              transport: http(RPC_URL),
            });

            // Write-enabled contract
            const hatMinterWrite = getContract({
              address: HAT_MINTER_CONTRACT,
              abi: HAT_MINTER_ABI,
              client: { public: publicClient, wallet: walletClient },
            });

            // Mint via contract (gas sponsored!)
            console.log('📤 Mint Hat API: Calling contract to mint hat...');

            const hash = isFirstUser
              ? await hatMinterWrite.write.mintExecutiveLeaderHat([walletAddress as `0x${string}`])
              : await hatMinterWrite.write.mintBetaTesterHat([walletAddress as `0x${string}`]);

            console.log(`   ⏳ Transaction hash: ${hash}`);

            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              timeout: 60_000,
            });

            if (receipt.status !== 'success') {
              throw new Error('Contract minting transaction failed');
            }

            console.log(`✅ Mint Hat API: Hat minted via contract (gas sponsored)!`);
            console.log(`   Transaction: ${hash}`);
            console.log(`   Block: ${receipt.blockNumber}`);

            return NextResponse.json({
              success: true,
              transactionHash: hash,
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
              hatName: isFirstUser ? 'Executive Pod Leader' : 'Beta Tester',
              mode: 'contract',
              gasSponsored: true,
            });
          }
        }
      } catch (contractError) {
        console.warn('⚠️ Mint Hat API: Contract mode failed, falling back to EOA mode');
        console.warn(`   Error: ${contractError instanceof Error ? contractError.message : 'Unknown'}`);
        // Fall through to EOA mode
      }
    } else {
      console.log('ℹ️ Mint Hat API: HatMinter contract not configured, using EOA mode');
    }

    // ============================================================
    // FALLBACK: EOA MODE (REQUIRES GAS)
    // ============================================================

    console.log('🔑 Mint Hat API: Using EOA mode (requires gas)...');

    // Get backend admin wallet (must wear Executive Pod Leader hat)
    // Uses same pattern as testnet airdrop system
    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

    if (!ADMIN_PRIVATE_KEY) {
      console.error('❌ Mint Hat API: No admin private key configured');
      console.error('   Set POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY in .env');
      return NextResponse.json(
        { success: false, error: 'Server configuration error - admin key missing' },
        { status: 500 },
      );
    }

    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);

    console.log(`🔑 Mint Hat API: Using admin wallet: ${adminAccount.address}`);

    // Determine which hat to mint
    const hatId = isFirstUser
      ? HAT_IDS.EXECUTIVE_POD_LEADER
      : HAT_IDS.BETA_TESTER_HAT;

    const hatName = isFirstUser ? 'Executive Pod Leader' : 'Beta Tester';

    if (!hatId) {
      console.error(`❌ Mint Hat API: ${hatName} hat ID not configured`);
      console.error('   Check NEXT_PUBLIC_EXECUTIVE_POD_LEADER or NEXT_PUBLIC_BETA_TESTER_HAT in .env');
      return NextResponse.json(
        { success: false, error: `${hatName} hat not configured` },
        { status: 500 },
      );
    }

    console.log(`   Hat to mint: ${hatName}`);
    console.log(`   Hat ID: ${hatId}`);

    // Create clients
    const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

    const walletClient = createWalletClient({
      account: adminAccount,
      chain: base,
      transport: http(RPC_URL),
    });

    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // Verify admin wallet has Executive Pod Leader hat
    console.log('🔍 Mint Hat API: Verifying admin wallet permissions...');
    const isAdminWearer = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.HATS_PROTOCOL,
      abi: HATS_MINT_ABI,
      functionName: 'isWearerOfHat',
      args: [adminAccount.address, BigInt(HAT_IDS.EXECUTIVE_POD_LEADER!)],
    });

    if (!isAdminWearer) {
      console.error('❌ Mint Hat API: Admin wallet does NOT wear Executive Pod Leader hat');
      console.error(`   Admin wallet: ${adminAccount.address}`);
      console.error(`   Required hat: ${HAT_IDS.EXECUTIVE_POD_LEADER}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Admin wallet lacks required permissions',
          details: 'Admin wallet must wear Executive Pod Leader hat',
        },
        { status: 500 },
      );
    }

    console.log('✅ Mint Hat API: Admin wallet verified - has Executive Pod Leader hat');

    // Check if user already has the hat
    console.log('🔍 Mint Hat API: Checking if user already has hat...');
    const alreadyHasHat = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.HATS_PROTOCOL,
      abi: HATS_MINT_ABI,
      functionName: 'isWearerOfHat',
      args: [walletAddress as `0x${string}`, BigInt(hatId)],
    });

    if (alreadyHasHat) {
      console.log(`ℹ️ Mint Hat API: User already wears ${hatName} hat`);
      return NextResponse.json({
        success: true,
        alreadyHadHat: true,
        message: `User already wears ${hatName} hat`,
        hatId,
      });
    }

    // Mint the hat
    console.log('📤 Mint Hat API: Sending mint transaction...');
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.HATS_PROTOCOL,
      abi: HATS_MINT_ABI,
      functionName: 'mintHat',
      args: [BigInt(hatId), walletAddress as `0x${string}`],
    });

    console.log(`   ⏳ Transaction hash: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000, // 60 second timeout
    });

    if (receipt.status !== 'success') {
      console.error('❌ Mint Hat API: Transaction failed');
      console.error(`   Receipt status: ${receipt.status}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Hat minting transaction failed',
          transactionHash: hash,
        },
        { status: 500 },
      );
    }

    console.log(`✅ Mint Hat API: ${hatName} hat minted successfully!`);
    console.log(`   Transaction: ${hash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);

    return NextResponse.json({
      success: true,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      hatId,
      hatName,
      mode: 'eoa',
      gasSponsored: false,
    });

  } catch (error) {
    console.error('❌ Mint Hat API: Unexpected error:', error);

    // Extract useful error message
    let errorMessage = 'Hat minting failed';
    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for common errors
      if (errorMessage.includes('AllHatsWorn')) {
        errorMessage = 'Hat supply limit reached';
      } else if (errorMessage.includes('AlreadyWearingHat')) {
        errorMessage = 'User already wears this hat';
      } else if (errorMessage.includes('NotAdmin')) {
        errorMessage = 'Admin wallet lacks permission to mint this hat';
      } else if (errorMessage.includes('HatNotActive')) {
        errorMessage = 'Hat is not active';
      } else if (errorMessage.includes('NotEligible')) {
        errorMessage = 'Recipient is not eligible for this hat';
      }
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
