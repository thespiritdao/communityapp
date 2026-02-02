import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const status = searchParams.get('status') || undefined;

    // Use new getProposals method that supports status filtering
    const proposals = await AgentService.getProposals(status, category);

    return NextResponse.json({
      success: true,
      data: proposals,
    });
  } catch (error: any) {
    console.error('Get proposals error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
