import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function GET(request: NextRequest) {
  try {
    const stats = await AgentService.getDashboardStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Get dashboard error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
