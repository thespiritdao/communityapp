import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(request: NextRequest) {
  try {
    const result = await AgentService.runWeekly();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Weekly cycle error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
