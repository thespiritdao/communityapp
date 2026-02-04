import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Hats Protocol contract on Base
const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const EXECUTIVE_POD_LEADER_HAT_ID = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER!;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Hats Protocol ABI - balanceOf function
const HATS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Verify if wallet has Executive Pod Leader HAT
 */
async function verifyExecutiveRole(walletAddress: string): Promise<boolean> {
  try {
    // First check database cache
    const { data: member } = await supabase
      .from('pod_members')
      .select('revoked_by_governance')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('pod_id', '00000001-0000-0000-0000-000000000001') // Executive Pod ID
      .single();

    // If revoked in database, reject immediately
    if (member?.revoked_by_governance) {
      console.log('❌ Executive role revoked in database:', walletAddress);
      return false;
    }

    // Verify on-chain HAT ownership
    const hatBalance = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [
        getAddress(walletAddress),
        BigInt(EXECUTIVE_POD_LEADER_HAT_ID),
      ],
    });

    const hasHat = hatBalance > 0n;
    console.log(`🎩 HAT verification for ${walletAddress}: ${hasHat ? 'APPROVED' : 'DENIED'}`);

    return hasHat;
  } catch (error: any) {
    console.error('❌ Executive role verification failed:', error);
    return false;
  }
}

/**
 * Check if donation has reached 2-of-3 approval threshold
 */
async function checkApprovalThreshold(donationId: string): Promise<boolean> {
  const { data: approvals } = await supabase
    .from('donation_approvals')
    .select('*')
    .eq('donation_id', donationId);

  const approvalCount = approvals?.length || 0;
  console.log(`📊 Donation ${donationId}: ${approvalCount}/2 approvals`);

  return approvalCount >= 2;
}

/**
 * POST /api/donations/approve
 *
 * Executive Pod member approves a donation for minting
 *
 * Request Body:
 * - donationId: UUID of pending donation
 * - executiveWallet: Wallet address of approving executive
 * - signature: (Optional) Signature for additional verification
 *
 * Flow:
 * 1. Verify executive has Executive Pod Leader HAT
 * 2. Check donation is in 'awaiting_executive_approval' status
 * 3. Check executive hasn't already approved this donation
 * 4. Record approval
 * 5. If 2-of-3 threshold met, trigger minting service
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { donationId, executiveWallet } = body;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!donationId || !executiveWallet) {
      return NextResponse.json(
        { error: 'donationId and executiveWallet required' },
        { status: 400 }
      );
    }

    // Normalize wallet address
    const normalizedWallet = executiveWallet.toLowerCase();

    // =====================================================
    // 2. VERIFY EXECUTIVE ROLE
    // =====================================================

    const hasExecutiveRole = await verifyExecutiveRole(normalizedWallet);

    if (!hasExecutiveRole) {
      console.error('❌ Unauthorized approval attempt:', normalizedWallet);
      return NextResponse.json(
        { error: 'Wallet does not have Executive Pod Leader role' },
        { status: 403 }
      );
    }

    console.log('✅ Executive role verified:', normalizedWallet);

    // =====================================================
    // 3. CHECK DONATION STATUS
    // =====================================================

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

    if (donation.status !== 'awaiting_executive_approval') {
      return NextResponse.json(
        {
          error: `Donation is not awaiting approval. Current status: ${donation.status}`,
          currentStatus: donation.status
        },
        { status: 400 }
      );
    }

    console.log('📋 Donation ready for approval:', {
      id: donationId,
      amount: donation.fiat_amount,
      tokens: donation.system_tokens_to_mint,
      userWallet: donation.user_wallet
    });

    // =====================================================
    // 4. CHECK FOR DUPLICATE APPROVAL
    // =====================================================

    const { data: existingApproval } = await supabase
      .from('donation_approvals')
      .select('*')
      .eq('donation_id', donationId)
      .eq('approver_wallet', normalizedWallet)
      .single();

    if (existingApproval) {
      return NextResponse.json(
        {
          error: 'You have already approved this donation',
          approvedAt: existingApproval.approved_at
        },
        { status: 400 }
      );
    }

    // =====================================================
    // 5. RECORD APPROVAL
    // =====================================================

    const { data: approval, error: approvalError } = await supabase
      .from('donation_approvals')
      .insert({
        donation_id: donationId,
        approver_wallet: normalizedWallet,
        approver_hat_id: EXECUTIVE_POD_LEADER_HAT_ID,
        approved_at: new Date().toISOString()
      })
      .select()
      .single();

    if (approvalError) {
      console.error('❌ Failed to record approval:', approvalError);
      return NextResponse.json(
        { error: 'Failed to record approval' },
        { status: 500 }
      );
    }

    console.log('✅ Approval recorded:', approval.id);

    // =====================================================
    // 6. CHECK APPROVAL THRESHOLD (2-of-3)
    // =====================================================

    const thresholdMet = await checkApprovalThreshold(donationId);

    if (thresholdMet) {
      console.log('🎉 2-of-3 approval threshold met! Triggering minting service...');

      // Update donation status to 'pending_mint'
      const { error: statusUpdateError } = await supabase
        .from('pending_donations')
        .update({
          status: 'pending_mint',
          approved_at: new Date().toISOString()
        })
        .eq('id', donationId);

      if (statusUpdateError) {
        console.error('❌ Failed to update donation status:', statusUpdateError);
      }

      // Trigger backend minting service
      try {
        console.log('🔄 Calling minting service for donation:', donationId);
        const mintResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/donations/mint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ donationId })
        });

        if (!mintResponse.ok) {
          const errorData = await mintResponse.json();
          console.error('❌ Minting service returned error:', {
            status: mintResponse.status,
            statusText: mintResponse.statusText,
            errorData
          });
          // Don't fail the approval - minting can be retried via cron
        } else {
          const mintData = await mintResponse.json();
          console.log('✅ Minting triggered successfully:', mintData);
        }
      } catch (mintError: any) {
        console.error('❌ Failed to trigger minting service:', {
          message: mintError.message,
          stack: mintError.stack
        });
        // Don't fail the approval - minting can be retried via cron
      }

      return NextResponse.json({
        success: true,
        message: 'Donation approved - minting will begin shortly',
        approval: {
          id: approval.id,
          donationId,
          executiveWallet: normalizedWallet,
          approvedAt: approval.approved_at
        },
        thresholdMet: true,
        status: 'pending_mint'
      });
    }

    // Threshold not yet met
    const { data: currentApprovals } = await supabase
      .from('donation_approvals')
      .select('approver_wallet, approved_at')
      .eq('donation_id', donationId);

    return NextResponse.json({
      success: true,
      message: `Approval recorded. Need 1 more executive approval to mint tokens.`,
      approval: {
        id: approval.id,
        donationId,
        executiveWallet: normalizedWallet,
        approvedAt: approval.approved_at
      },
      thresholdMet: false,
      currentApprovals: currentApprovals?.length || 0,
      requiredApprovals: 2
    });

  } catch (error: any) {
    console.error('❌ Donation approval error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/donations/approve?donationId=xxx
 *
 * Check approval status of a donation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const donationId = searchParams.get('donationId');

    if (!donationId) {
      return NextResponse.json(
        { error: 'donationId required' },
        { status: 400 }
      );
    }

    // Get donation
    const { data: donation, error: donationError } = await supabase
      .from('pending_donations')
      .select('*')
      .eq('id', donationId)
      .single();

    if (donationError || !donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    // Get approvals
    const { data: approvals } = await supabase
      .from('donation_approvals')
      .select('approver_wallet, approved_at')
      .eq('donation_id', donationId)
      .order('approved_at', { ascending: true });

    const thresholdMet = (approvals?.length || 0) >= 2;

    return NextResponse.json({
      donation: {
        id: donation.id,
        status: donation.status,
        amount: donation.fiat_amount,
        systemTokens: donation.system_tokens_to_mint,
        userWallet: donation.user_wallet,
        settlementDate: donation.settlement_date,
        createdAt: donation.created_at
      },
      approvals: approvals || [],
      currentApprovals: approvals?.length || 0,
      requiredApprovals: 2,
      thresholdMet
    });

  } catch (error: any) {
    console.error('❌ Approval status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
