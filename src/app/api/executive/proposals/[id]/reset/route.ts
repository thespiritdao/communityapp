import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const proposalId = params.id;

    const result = await AgentService.resetProposalForReexecution(proposalId);

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Reset proposal error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
