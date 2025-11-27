import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bountyId = searchParams.get('id');

    if (!bountyId) {
      return NextResponse.json(
        { error: 'Bounty ID is required' },
        { status: 400 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: bounty, error } = await supabase
      .from('bounties')
      .select('*')
      .eq('id', bountyId)
      .single();

    if (error) {
      console.error('Error fetching bounty:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bounty' },
        { status: 500 },
      );
    }

    if (!bounty) {
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }

    // Transform to V2 format
    const bountyV2 = {
      id: bounty.id.toString(),
      creator: bounty.creator || '',
      value: bounty.value?.toString() || '0',
      token: bounty.token || '0x1317Ae277266D38C4E492558f8693F14143a6A65',
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
    };

    return NextResponse.json(bountyV2);
  } catch (error) {
    console.error('Error in bounty get API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
