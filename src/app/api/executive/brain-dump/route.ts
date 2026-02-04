import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(request: NextRequest) {
  try {
    const { thoughts } = await request.json();

    if (!thoughts || typeof thoughts !== 'string') {
      return NextResponse.json(
        { error: 'Thoughts required' },
        { status: 400 }
      );
    }

    const result = await AgentService.processBrainDump(thoughts);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Brain dump error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
