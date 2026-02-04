import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function GET(request: NextRequest) {
  try {
    const artifacts = await AgentService.getArtifacts();

    return NextResponse.json({
      success: true,
      data: artifacts,
    });
  } catch (error: any) {
    console.error('Get artifacts error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
