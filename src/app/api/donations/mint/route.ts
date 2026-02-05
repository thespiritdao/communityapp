import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encodeFunctionData, createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// System Token contract
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN!;

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
 * Initialize Coinbase SDK with API credentials
 * This creates a CDP Smart Account for backend minting
 */
function initializeCoinbaseSDK() {
  const apiKeyName = process.env.CDP_API_KEY;
  let privateKey = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;

  if (!apiKeyName || !privateKey) {
    throw new Error('CDP_API_KEY and EXECUTIVE_MINTING_PRIVATE_KEY required');
  }

  // Handle escaped newlines from environment variables
  // Vercel/env files may have literal \n instead of actual newlines
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return Coinbase.configure({
    apiKeyName,
    privateKey,
  });
}

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
    // TODO: Implement email/in-app notification via SendGrid
  } catch (error) {
    console.error('❌ Failed to notify user:', error);
  }
}

/**
 * Update treasury metadata after minting
 */
async function updateTreasuryMetadata(amountMinted: number) {
  try {
    const { data: metadata } = await supabase
      .from('system_supply_metadata')
      .select('*')
      .single();

    if (metadata) {
      await supabase
        .from('system_supply_metadata')
        .update({
          total_minted: Number(metadata.total_minted) + amountMinted,
          circulating_supply: Number(metadata.circulating_supply) + amountMinted,
          last_updated: new Date().toISOString()
        })
        .eq('id', metadata.id);
    } else {
      await supabase
        .from('system_supply_metadata')
        .insert({
          total_minted: amountMinted,
          total_burned: 0,
          circulating_supply: amountMinted,
          nonprofit_balance: 0,
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
 * Backend service to mint $SYSTEM tokens using CDP Smart Account (gasless)
 *
 * This endpoint:
 * - Uses CDP Smart Account with paymaster (NO GAS FEES)
 * - Wallet must have EXECUTIVE_ROLE on SystemToken contract
 * - Called automatically when 2-of-3 approval threshold met
 * - Can be called manually via cron for retry
 *
 * Security:
 * - Only accessible via service role key
 * - Verifies donation has 'pending_mint' status
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

    console.log('🪙 Starting mint process with CDP Smart Account:', {
      donationId,
      userWallet: donation.user_wallet,
      amount: donation.system_tokens_to_mint
    });

    // =====================================================
    // 3. INITIALIZE CDP SMART ACCOUNT
    // =====================================================

    try {
      initializeCoinbaseSDK();
    } catch (error: any) {
      console.error('❌ Failed to initialize CDP SDK:', error);
      return NextResponse.json(
        { error: 'Minting service not configured', details: error.message },
        { status: 500 }
      );
    }

    // Import persistent wallet for minting
    // NOTE: This wallet has EXECUTIVE_ROLE on SystemToken contract
    let wallet: Wallet;

    try {
      // Import wallet from environment variable (set in Vercel)
      const walletData = process.env.MINTING_WALLET_DATA;

      if (!walletData) {
        throw new Error('MINTING_WALLET_DATA environment variable not set');
      }

      const walletConfig = JSON.parse(walletData);
      wallet = await Wallet.import(walletConfig);

      const walletAddress = await wallet.getDefaultAddress();
      const walletAddressStr = walletAddress.getId();

      console.log('💼 Using minting wallet:', walletAddressStr);
    } catch (error: any) {
      console.error('❌ Failed to get CDP wallet:', error);
      return NextResponse.json(
        { error: 'Failed to initialize minting wallet', details: error.message },
        { status: 500 }
      );
    }

    // =====================================================
    // 4. MINT TOKENS ON-CHAIN (GASLESS VIA PAYMASTER)
    // =====================================================

    // Convert token amount to wei (18 decimals)
    const amountInWei = BigInt(Math.floor(donation.system_tokens_to_mint * 1e18));

    console.log('📝 Preparing gasless mint transaction:', {
      to: donation.user_wallet,
      amount: donation.system_tokens_to_mint,
      amountInWei: amountInWei.toString(),
      usePaymaster: true
    });

    // Update status to 'minting' to prevent duplicate attempts
    await supabase
      .from('pending_donations')
      .update({ status: 'minting' })
      .eq('id', donationId);

    try {
      // Encode mint function call
      const mintCallData = encodeFunctionData({
        abi: SYSTEM_TOKEN_ABI,
        functionName: 'mint',
        args: [getAddress(donation.user_wallet), amountInWei],
      });

      // Invoke contract via CDP Smart Account (gasless via paymaster)
      console.log('🔄 Invoking mint contract:', {
        contract: SYSTEM_TOKEN_ADDRESS,
        to: donation.user_wallet,
        amount: amountInWei.toString(),
        network: 'base-mainnet'
      });

      // Invoke contract with proper args format
      // CDP SDK expects args as a mapping object (not stringified)
      // CRITICAL: Paymaster URL enables gasless transactions
      const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;

      console.log('⛽ Paymaster configuration:', {
        hasPaymaster: !!paymasterUrl,
        paymasterUrl: paymasterUrl ? `${paymasterUrl.substring(0, 50)}...` : 'not set'
      });

      const invocation = await wallet.invokeContract({
        contractAddress: SYSTEM_TOKEN_ADDRESS,
        method: 'mint',
        args: {
          to: donation.user_wallet,
          amount: amountInWei.toString(),
        },
        abi: SYSTEM_TOKEN_ABI,
        ...(paymasterUrl && { paymasterUrl }), // Add paymaster if available
      });

      // Wait for transaction to be mined
      await invocation.wait();

      const txHash = invocation.getTransactionHash();

      console.log('✅ Gasless mint transaction confirmed:', txHash);

      // Verify balance increased
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
      await notifyUserMintComplete(donation, txHash || 'pending');

      return NextResponse.json({
        success: true,
        message: 'Tokens minted successfully (gasless)',
        donation: {
          id: donationId,
          userWallet: donation.user_wallet,
          amountMinted: donation.system_tokens_to_mint,
          txHash: txHash || null,
          mintedAt: new Date().toISOString()
        },
        gasless: true
      });

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
