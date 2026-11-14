import { PODS } from '@/config/deployment';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EXEC_POD_ID = (PODS.governance ?? '');

/**
 * GET /api/donations/exec-treasury
 * Returns the Exec Pod treasury_contract_address for community token minting.
 */
export async function GET() {
  const { data, error } = await supabase
    .from('pods')
    .select('treasury_contract_address')
    .eq('id', EXEC_POD_ID)
    .single();

  if (error || !data?.treasury_contract_address) {
    return NextResponse.json({ error: 'Exec Pod treasury not found' }, { status: 404 });
  }

  return NextResponse.json({ treasuryAddress: data.treasury_contract_address });
}
