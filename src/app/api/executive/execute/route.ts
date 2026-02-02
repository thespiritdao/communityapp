import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(request: NextRequest) {
  try {
    const executed = await AgentService.executeApproved();

    return NextResponse.json({
      success: true,
      message: `Executed ${executed.length} proposals`,
      data: executed,
    });
  } catch (error: any) {
    console.error('Execute error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
