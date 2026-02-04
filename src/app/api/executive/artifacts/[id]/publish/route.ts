import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Mark artifact as published/archived
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artifactId = params.id;
    const { published } = await request.json();

    const { error } = await supabase
      .from('agent_artifacts')
      .update({
        published: published !== false, // Default to true
        published_at: published !== false ? new Date().toISOString() : null,
      })
      .eq('id', artifactId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: published ? 'Artifact marked as published' : 'Artifact unmarked',
    });
  } catch (error: any) {
    console.error('Publish artifact error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
