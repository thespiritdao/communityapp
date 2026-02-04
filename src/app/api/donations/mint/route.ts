import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, getAddress } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// System Token contract
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN!;
const MINTING_PRIVATE_KEY = process.env.EXECUTIVE_MINTING_PRIVATE_KEY!; // Backend wallet with EXECUTIVE_ROLE

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// ERC20 Mint ABI
const SYSTEM_TOKEN_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Notify user about minted tokens (email/in-app notification)
 */
async function notifyUserMintComplete(donation: any, txHash: string) {
  try {
    console.log('📧 Notifying user about minted tokens:', {
      userWallet: donation.user_wallet,
      amount: donation.system_tokens_to_mint,
      txHash
    });
    // TODO: Implement email/in-app notification
    // Could use SendGrid API or create in-app notification
  } catch (error) {
    console.error('❌ Failed to notify user:', error);
  }
}

/**
 * Update treasury metadata after minting
 */
async function updateTreasuryMetadata(amountMinted: number) {
  try {
    // Get current metadata
    const { data: metadata } = await supabase
      .from('system_supply_metadata')
      .select('*')
      .single();

    if (metadata) {
      // Update existing record
      await supabase
        .from('system_supply_metadata')
        .update({
          total_minted: Number(metadata.total_minted) + amountMinted,
          circulating_supply: Number(metadata.circulating_supply) + amountMinted,
          last_updated: new Date().toISOString()
        })
        .eq('id', metadata.id);
    } else {
      // Create initial record
      await supabase
        .from('system_supply_metadata')
        .insert({
          total_minted: amountMinted,
          total_burned: 0,
          circulating_supply: amountMinted,
          nonprofit_balance: 0, // Will be updated by treasury sync job
          last_updated: new Date().toISOString()
        });
    }

    console.log('✅ Treasury metadata updated:', amountMinted);
  } catch (error) {
    console.error('❌ Failed to update treasury metadata:', error);
  }
}

/**
 * POST /api/donations/mint
 *
 * Backend service to mint $SYSTEM tokens after executive approval
 *
 * This endpoint should be called:
 * 1. Automatically when 2-of-3 approval threshold is met
 * 2. Manually via cron job to retry failed mints
 *
 * Security:
 * - Only accessible via service role key (not public)
 * - Verifies donation has 'pending_mint' status
 * - Uses backend wallet with EXECUTIVE_ROLE
 * - Records transaction hash for transparency
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { donationId } = body;

    // =====================================================
    // 1. VERIFY SERVICE ROLE ACCESS
    // =====================================================

    const authHeader = request.headers.get('authorization');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      console.error('❌ Unauthorized minting attempt');
      return NextResponse.json(
        { error: 'Unauthorized - service role required' },
        { status: 403 }
      );
    }

    // =====================================================
    // 2. VALIDATE DONATION
    // =====================================================

    if (!donationId) {
      return NextResponse.json(
        { error: 'donationId required' },
        { status: 400 }
      );
    }

    const { data: donation, error: fetchError } = await supabase
      .from('pending_donations')
      .select('*')
      .eq('id', donationId)
      .single();

    if (fetchError || !donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    if (donation.status === 'minted') {
      return NextResponse.json(
        {
          error: 'Donation already minted',
          mintedAt: donation.minted_at,
          txHash: donation.tx_hash
        },
        { status: 400 }
      );
    }

    if (donation.status !== 'pending_mint') {
      return NextResponse.json(
        {
          error: `Donation not ready for minting. Current status: ${donation.status}`,
          currentStatus: donation.status
        },
        { status: 400 }
      );
    }

    console.log('🪙 Starting mint process:', {
      donationId,
      userWallet: donation.user_wallet,
      amount: donation.system_tokens_to_mint
    });

    // =====================================================
    // 3. CHECK BACKEND WALLET BALANCE (for gas)
    // =====================================================

    if (!MINTING_PRIVATE_KEY) {
      console.error('❌ EXECUTIVE_MINTING_PRIVATE_KEY not configured');
      return NextResponse.json(
        { error: 'Minting service not configured' },
        { status: 500 }
      );
    }

    const mintingAccount = privateKeyToAccount(MINTING_PRIVATE_KEY as `0x${string}`);

    const balance = await publicClient.getBalance({
      address: mintingAccount.address,
    });

    console.log(`💰 Minting wallet balance: ${Number(balance) / 1e18} ETH`);

    if (balance < parseEther('0.0001')) {
      console.error('❌ Insufficient gas in minting wallet');
      return NextResponse.json(
        { error: 'Insufficient gas for minting' },
        { status: 500 }
      );
    }

    // =====================================================
    // 4. MINT TOKENS ON-CHAIN
    // =====================================================

    const walletClient = createWalletClient({
      account: mintingAccount,
      chain: base,
      transport: http(),
    });

    // Convert token amount to wei (18 decimals)
    const amountInWei = BigInt(Math.floor(donation.system_tokens_to_mint * 1e18));

    console.log('📝 Preparing mint transaction:', {
      to: donation.user_wallet,
      amount: donation.system_tokens_to_mint,
      amountInWei: amountInWei.toString()
    });

    // Update status to 'minting' to prevent duplicate attempts
    await supabase
      .from('pending_donations')
      .update({ status: 'minting' })
      .eq('id', donationId);

    try {
      // Execute mint transaction
      const txHash = await walletClient.writeContract({
        address: SYSTEM_TOKEN_ADDRESS as `0x${string}`,
        abi: SYSTEM_TOKEN_ABI,
        functionName: 'mint',
        args: [getAddress(donation.user_wallet), amountInWei],
      });

      console.log('🚀 Mint transaction submitted:', txHash);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status === 'success') {
        console.log('✅ Mint transaction confirmed!');

        // Verify balance
        const newBalance = await publicClient.readContract({
          address: SYSTEM_TOKEN_ADDRESS as `0x${string}`,
          abi: SYSTEM_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [getAddress(donation.user_wallet)],
        });

        console.log(`✅ User's new $SYSTEM balance: ${Number(newBalance) / 1e18}`);

        // Update donation status to 'minted'
        const { error: updateError } = await supabase
          .from('pending_donations')
          .update({
            status: 'minted',
            minted_at: new Date().toISOString(),
            tx_hash: txHash
          })
          .eq('id', donationId);

        if (updateError) {
          console.error('❌ Failed to update donation status:', updateError);
        }

        // Update treasury metadata
        await updateTreasuryMetadata(donation.system_tokens_to_mint);

        // Notify user
        await notifyUserMintComplete(donation, txHash);

        return NextResponse.json({
          success: true,
          message: 'Tokens minted successfully',
          donation: {
            id: donationId,
            userWallet: donation.user_wallet,
            amountMinted: donation.system_tokens_to_mint,
            txHash,
            mintedAt: new Date().toISOString()
          },
          transaction: {
            hash: txHash,
            blockNumber: receipt.blockNumber.toString(),
            gasUsed: receipt.gasUsed.toString()
          }
        });
      } else {
        throw new Error('Transaction failed on-chain');
      }

    } catch (mintError: any) {
      console.error('❌ Mint transaction failed:', mintError);

      // Revert status back to pending_mint for retry
      await supabase
        .from('pending_donations')
        .update({
          status: 'pending_mint',
          failure_reason: mintError.message || 'Mint transaction failed'
        })
        .eq('id', donationId);

      return NextResponse.json(
        {
          error: 'Minting failed',
          details: mintError.message,
          donationId
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Minting service error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/donations/mint?status=pending_mint
 *
 * Get list of donations pending mint (for cron job)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending_mint';

    const { data: donations, error } = await supabase
      .from('pending_donations')
      .select('*')
      .eq('status', status)
      .order('approved_at', { ascending: true });

    if (error) {
      console.error('❌ Failed to fetch pending donations:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      donations: donations || [],
      count: donations?.length || 0
    });

  } catch (error: any) {
    console.error('❌ Pending donations fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
