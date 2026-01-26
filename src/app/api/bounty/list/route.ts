import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const podId = searchParams.get('podId');

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    let query = supabase
      .from('bounties')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by pod if specified
    if (podId && podId !== 'all') {
      query = query.eq('pod_id', podId);
    }

    const { data: bounties, error } = await query;

    if (error) {
      console.error('Error fetching bounties:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bounties' },
        { status: 500 },
      );
    }

    // Transform to V2 format
    const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string;
    const bountiesV2 = (bounties || []).map((bounty) => ({
      id: bounty.id.toString(),
      creator: bounty.creator || '',
      value: bounty.value?.toString() || '0',
      token: bounty.token || SYSTEM_TOKEN || '',
      status: bounty.status || 0,
      podId: bounty.pod_id || '',
      category: bounty.category || '',
      ipfsHash: bounty.ipfs_hash || 'temp',
      createdAt: bounty.created_at
        ? Math.floor(new Date(bounty.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      deadline: bounty.deadline
        ? Math.floor(new Date(bounty.deadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 604800,
      fundingSource: bounty.funding_source || 'pod_treasury',
    }));

    return NextResponse.json(bountiesV2);
  } catch (error) {
    console.error('Error in bounty list API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
