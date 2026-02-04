import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const proposalId = params.id;

    // Execute single proposal
    const artifact = await AgentService.executeSingleProposal(proposalId);

    return NextResponse.json({
      success: true,
      data: artifact,
    });
  } catch (error: any) {
    console.error('Execute proposal error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
