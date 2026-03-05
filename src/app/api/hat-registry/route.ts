import { NextResponse } from 'next/server';
import { getHatIds } from '@/lib/hatRegistry';

/**
 * GET /api/hat-registry
 *
 * Returns all active hat IDs from the database.
 * Hat IDs are not secret — this endpoint is public.
 * Results are cached at the Next.js edge and server layer.
 */
export async function GET() {
  try {
    const ids = await getHatIds();
    return NextResponse.json(ids, {
      headers: {
        // Allow client-side caching for 5 minutes
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (error: any) {
    console.error('[/api/hat-registry] Failed to load hat IDs:', error.message);
    return NextResponse.json(
      { error: 'Failed to load hat registry' },
      { status: 500 },
    );
  }
}
