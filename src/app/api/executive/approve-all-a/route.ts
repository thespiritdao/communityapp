import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agentService';

export async function POST(request: NextRequest) {
  try {
    const count = await AgentService.approveAllA();

    return NextResponse.json({
      success: true,
      message: `Approved ${count} A-category proposals`,
      count,
    });
  } catch (error: any) {
    console.error('Approve all A error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
