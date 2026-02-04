import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function GET(request: NextRequest) {
  try {
    const history = await AgentService.getHistory();

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('Get history error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
