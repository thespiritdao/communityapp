/**
 * API Route: Update Event Contract Address
 *
 * POST /api/events/update-contract
 *
 * Updates an event with the contract address after on-chain creation
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge';

interface UpdateContractRequest {
  blockchain_event_id: string;
  contract_address: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: UpdateContractRequest = await request.json();
    const { blockchain_event_id, contract_address } = body;

    if (!blockchain_event_id || !contract_address) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing blockchain_event_id or contract_address',
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('events')
      .update({
        registration_contract_address: contract_address,
        completion_contract_address: contract_address,
        status: 'published',
      })
      .eq('blockchain_event_id', blockchain_event_id)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Update contract error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
