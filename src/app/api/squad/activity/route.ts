import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET recent activity feed
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const { data: activities, error } = await supabase
      .from('activities')
      .select(`
        *,
        agents (
          name,
          role
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: activities || [],
    });
  } catch (error: any) {
    console.error('Get activity error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
