import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET all agents with their current status
 */
export async function GET(request: NextRequest) {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: agents || [],
    });
  } catch (error: any) {
    console.error('Get agents error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
