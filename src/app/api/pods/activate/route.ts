import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('🏦 Pod activation request:', body);

    const { podId, treasuryAddress, isActive } = body;

    if (!podId) {
      return NextResponse.json({ error: 'Missing podId' }, { status: 400 });
    }

    // Update pod with treasury information
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (treasuryAddress) {
      updateData.treasury_contract_address = treasuryAddress;
      updateData.treasury_deployed_at = new Date().toISOString();
      updateData.is_active = true;
    }

    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    const { data, error } = await supabase
      .from('pods')
      .update(updateData)
      .eq('id', podId)
      .select();

    if (error) {
      console.error('🏦 Database update error:', error);
      return NextResponse.json(
        {
          error: `Database error: ${error.message}`,
        },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: 'Pod not found',
        },
        { status: 404 },
      );
    }

    console.log('🏦 Pod updated successfully:', data[0]);

    return NextResponse.json({
      ok: true,
      message: treasuryAddress
        ? 'Treasury deployed and registered successfully'
        : 'Pod updated successfully',
      pod: data[0],
    });
  } catch (e: any) {
    console.error('🏦 Pod activation error:', e);
    return NextResponse.json(
      {
        error: e?.message || 'Failed to process request',
      },
      { status: 500 },
    );
  }
}
