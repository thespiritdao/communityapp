import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/gifts/record
 * Saves a gift record to the database using the service role key,
 * bypassing RLS (client-side anon key cannot insert due to auth.uid() policy).
 */
export async function POST(request: NextRequest) {
  try {
    const { sender_id, recipient_id, token, amount, message, transaction_hash } = await request.json();

    if (!sender_id || !recipient_id || !token || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase.from('gifts').insert({
      sender_id: sender_id.toLowerCase(),
      recipient_id: recipient_id.toLowerCase(),
      token,
      amount,
      message: message || null,
      transaction_hash: transaction_hash || null,
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) {
      console.error('[gifts/record] DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, gift: data });
  } catch (error: any) {
    console.error('[gifts/record] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
