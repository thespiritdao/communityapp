import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { reason } = await request.json().catch(() => ({}));

    await AgentService.rejectProposal(params.id, reason);

    return NextResponse.json({
      success: true,
      message: 'Proposal rejected',
    });
  } catch (error: any) {
    console.error('Reject proposal error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
