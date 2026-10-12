import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';
import { getHatId } from '@/lib/hatRegistry';
import { getWalletFromRequest } from '@/lib/serverPodAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Hats Protocol contract on Base
const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

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
      .eq('wallet', walletAddress.toLowerCase())
      .eq('pod_id', '00000001-0000-0000-0000-000000000001') // Executive Pod ID
      .single();

    // If revoked in database, reject immediately
    if (member?.revoked_by_governance) {
      console.log('❌ Executive role revoked in database:', walletAddress);
      return false;
    }

    // Load hat ID from registry
    const executiveHatId = await getHatId('EXECUTIVE_POD_LEADER');
    if (!executiveHatId) {
      console.error('❌ EXECUTIVE_POD_LEADER hat ID not configured in hat_registry');
      return false;
    }

    // Verify on-chain HAT ownership
    const hatBalance = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [
        getAddress(walletAddress),
        BigInt(executiveHatId),
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

// Single source of truth for the approval policy: one EP member approves.
// If the DAO moves to multi-sig approvals, change only this constant.
const REQUIRED_APPROVALS = 1;

/**
 * Check if donation has reached the required approval threshold
 */
async function checkApprovalThreshold(donationId: string): Promise<boolean> {
  const { data: approvals } = await supabase
    .from('donation_approvals')
    .select('*')
    .eq('donation_id', donationId);

  const approvalCount = approvals?.length || 0;
  console.log(`📊 Donation ${donationId}: ${approvalCount}/${REQUIRED_APPROVALS} approvals`);

  return approvalCount >= REQUIRED_APPROVALS;
}

/**
 * POST /api/donations/approve
 *
 * Executive Pod member approves a donation for minting
 *
 * Auth: Authorization: Bearer <supabase JWT>. The approving executive is the
 * verified JWT wallet — NOT a request-body field.
 *
 * Request Body:
 * - donationId: UUID of pending donation
 *
 * Flow:
 * 1. Verify executive has Executive Pod Leader HAT
 * 2. Check donation is in 'awaiting_executive_approval' status
 * 3. Check executive hasn't already approved this donation
 * 4. Record approval
 * 5. If approval threshold met (REQUIRED_APPROVALS), mark ready to mint
 */
export async function POST(request: NextRequest) {
  try {
    // =====================================================
    // 0. AUTHENTICATE CALLER (bind approval to the JWT wallet)
    // =====================================================
    // The approving executive is the VERIFIED caller — never a body field.
    // Previously executiveWallet was taken from the body and only checked for
    // the hat, letting anyone forge an approval attributed to a real exec.
    const callerAddress = await getWalletFromRequest(request);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { donationId } = body;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!donationId) {
      return NextResponse.json(
        { error: 'donationId required' },
        { status: 400 }
      );
    }

    // The approver is the authenticated caller.
    const normalizedWallet = callerAddress.toLowerCase();

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

    const approvableStatuses = ['payment_pending', 'awaiting_settlement', 'awaiting_executive_approval'];
    if (!approvableStatuses.includes(donation.status)) {
      return NextResponse.json(
        {
          error: `Donation cannot be approved from status: ${donation.status}`,
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

    const executiveHatIdForRecord = await getHatId('EXECUTIVE_POD_LEADER');

    const { data: approval, error: approvalError } = await supabase
      .from('donation_approvals')
      .insert({
        donation_id: donationId,
        approver_wallet: normalizedWallet,
        approver_hat_id: executiveHatIdForRecord ?? null,
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
    // 6. CHECK APPROVAL THRESHOLD
    // =====================================================

    const thresholdMet = await checkApprovalThreshold(donationId);

    if (thresholdMet) {
      console.log('🎉 Approval threshold met! Donation ready to mint.');

      // Update donation status to 'pending_mint'
      const { error: statusUpdateError } = await supabase
        .from('pending_donations')
        .update({
          status: 'pending_mint'
          // Note: approved_at tracking handled via donation_approvals table
        })
        .eq('id', donationId);

      if (statusUpdateError) {
        console.error('❌ Failed to update donation status:', statusUpdateError);
      }

      // MINTING NOW HAPPENS ON FRONTEND (not backend)
      // Executive will see "Mint $SYSTEM Tokens" button on dashboard
      // When clicked, their Smart Wallet will execute gasless mint transaction
      console.log('✅ Donation approved! Executive can now mint tokens via frontend dashboard.');

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
      message: `Approval recorded.`,
      approval: {
        id: approval.id,
        donationId,
        executiveWallet: normalizedWallet,
        approvedAt: approval.approved_at
      },
      thresholdMet: false,
      currentApprovals: currentApprovals?.length || 0,
      requiredApprovals: REQUIRED_APPROVALS
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
 * Check approval status of a donation. Requires a session: the donor or an
 * Executive Leader only.
 */
export async function GET(request: NextRequest) {
  try {
    const callerAddress = (await getWalletFromRequest(request))?.toLowerCase();
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const isDonor = String(donation.user_wallet || '').toLowerCase() === callerAddress;
    if (!isDonor && !(await verifyExecutiveRole(callerAddress))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get approvals
    const { data: approvals } = await supabase
      .from('donation_approvals')
      .select('approver_wallet, approved_at')
      .eq('donation_id', donationId)
      .order('approved_at', { ascending: true });

    const thresholdMet = (approvals?.length || 0) >= REQUIRED_APPROVALS;

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
      requiredApprovals: REQUIRED_APPROVALS,
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
