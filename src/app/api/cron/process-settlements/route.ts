import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.spiritdao.org';

/**
 * Notify all active EP members that settled card donations are ready to approve.
 */
async function notifyExecutivePod(donations: any[]) {
  try {
    const { data: members, error } = await supabase
      .from('pod_members')
      .select('wallet_address')
      .eq('pod_id', EXEC_POD_ID)
      .is('revoked_by_governance', null);

    if (error || !members?.length) {
      console.warn('⚠️ No EP members found for settlement notification');
      return;
    }

    const count = donations.length;
    const title = `${count} Donation${count !== 1 ? 's' : ''} Ready to Approve`;
    const message = donations
      .map((d: any) => `${Number(d.system_tokens_to_mint).toFixed(2)} $SYSTEM (${String(d.user_wallet).slice(0, 8)}…)`)
      .join(', ');

    await Promise.allSettled(
      members.map(({ wallet_address }: { wallet_address: string }) =>
        fetch(`${BASE_URL}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          },
          body: JSON.stringify({
            recipient_address: wallet_address,
            sender_address: '0x0000000000000000000000000000000000000000',
            notification_type: 'pod_approval_request',
            title,
            message,
            context_url: `/pods/${EXEC_POD_ID}/manage?tab=donations`,
            context_type: 'donation',
            priority: 'high',
            category: 'governance',
          }),
        })
      )
    );

    console.log(`📢 Notified ${members.length} EP member(s) of ${count} settled donation(s)`);
  } catch (error) {
    console.error('❌ Failed to notify Executive Pod:', error);
  }
}

/**
 * GET/POST /api/cron/process-settlements
 *
 * Vercel Cron Job: Process donations past settlement hold period
 *
 * Schedule: Every 5 minutes
 * vercel.json configuration:
 * @example
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-settlements",
 *     "schedule": "every 5 minutes"
 *   }]
 * }
 *
 * This job:
 * 1. Finds donations with status 'awaiting_settlement'
 * 2. Checks if settlement_date has passed
 * 3. Transitions to 'awaiting_executive_approval'
 * 4. Notifies Executive Pod members
 */
export async function GET(request: NextRequest) {
  return handleProcessSettlements(request);
}

export async function POST(request: NextRequest) {
  return handleProcessSettlements(request);
}

async function handleProcessSettlements(request: NextRequest) {
  const startTime = Date.now();

  try {
    // =====================================================
    // 1. VERIFY CRON SECRET (Production Security)
    // =====================================================

    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // In production, verify cron secret from Vercel
    if (process.env.NODE_ENV === 'production' && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('❌ Unauthorized cron job attempt');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    console.log('🔄 Starting settlement processing cron job...');

    // =====================================================
    // 2. FIND DONATIONS PAST SETTLEMENT DATE
    // =====================================================

    const { data: settledDonations, error: fetchError } = await supabase
      .from('pending_donations')
      .select('*')
      .eq('status', 'awaiting_settlement')
      .lte('settlement_date', new Date().toISOString())
      .order('settlement_date', { ascending: true });

    if (fetchError) {
      console.error('❌ Database error fetching settled donations:', fetchError);
      return NextResponse.json(
        { error: 'Database error', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!settledDonations || settledDonations.length === 0) {
      console.log('✅ No donations ready for approval');
      return NextResponse.json({
        success: true,
        message: 'No donations to process',
        processed: 0,
        duration: Date.now() - startTime
      });
    }

    console.log(`📊 Found ${settledDonations.length} donations past settlement date`);

    // =====================================================
    // 3. TRANSITION TO AWAITING APPROVAL
    // =====================================================

    const processed: any[] = [];
    const failed: any[] = [];

    for (const donation of settledDonations) {
      try {
        console.log(`  Processing donation ${donation.id}...`);

        const { error: updateError } = await supabase
          .from('pending_donations')
          .update({
            status: 'awaiting_executive_approval',
            settled_at: new Date().toISOString()
          })
          .eq('id', donation.id);

        if (updateError) {
          console.error(`  ❌ Failed to update donation ${donation.id}:`, updateError);
          failed.push({
            donationId: donation.id,
            error: updateError.message
          });
        } else {
          console.log(`  ✅ Donation ${donation.id} ready for executive approval`);
          processed.push({
            donationId: donation.id,
            amount: donation.fiat_amount,
            tokens: donation.system_tokens_to_mint,
            userWallet: donation.user_wallet
          });
        }
      } catch (error: any) {
        console.error(`  ❌ Error processing donation ${donation.id}:`, error);
        failed.push({
          donationId: donation.id,
          error: error.message
        });
      }
    }

    // =====================================================
    // 4. NOTIFY EXECUTIVE POD
    // =====================================================

    if (processed.length > 0) {
      await notifyExecutivePod(processed);
    }

    // =====================================================
    // 5. RETURN SUMMARY
    // =====================================================

    const duration = Date.now() - startTime;

    console.log(`🎉 Settlement processing complete: ${processed.length} processed, ${failed.length} failed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: `Processed ${processed.length} donations`,
      processed: processed.length,
      failed: failed.length,
      duration,
      details: {
        processed,
        failed
      }
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Settlement processing cron job error:', error);

    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error.message,
        duration
      },
      { status: 500 }
    );
  }
}
