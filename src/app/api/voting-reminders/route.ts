// src/app/api/voting-reminders/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import { votingReminderService } from '@/services/votingReminderService';
import { requireCron } from '@/lib/cronAuth';

export async function POST(request: NextRequest) {
  try {
    const denied = requireCron(request);
    if (denied) return denied;

    console.log('🕐 Processing voting reminders via cron job...');

    await votingReminderService.processAllVotingReminders();

    console.log('✅ Voting reminders processed successfully');

    return NextResponse.json({
      success: true,
      message: 'Voting reminders processed successfully',
    });
  } catch (error) {
    console.error('❌ Error processing voting reminders:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  try {
    // For testing purposes - you might want to remove this in production
    const testMode = request.nextUrl.searchParams.get('test') === 'true';

    if (!testMode) {
      return NextResponse.json({
        message:
          'Voting reminder cron endpoint. Use POST method with proper authentication.',
      });
    }

    console.log('🧪 Test mode: Processing voting reminders...');

    await votingReminderService.processAllVotingReminders();

    return NextResponse.json({
      success: true,
      message: 'Test run completed',
    });
  } catch (error) {
    console.error('❌ Error in test run:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    );
  }
}
