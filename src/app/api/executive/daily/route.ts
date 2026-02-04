import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(request: NextRequest) {
  try {
    // TODO: Add exec pod authentication
    // const { user } = await authenticate(request);
    // if (!hasExecPodRole(user)) throw new Error('Unauthorized');

    const result = await AgentService.runDaily();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Daily pulse error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
