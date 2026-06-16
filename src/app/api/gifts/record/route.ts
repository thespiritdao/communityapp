import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/gifts/record
 * Saves a gift record to the database using the service role key,
 * bypassing RLS (client-side anon key cannot insert due to auth.uid() policy).
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate caller via JWT
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callerAddress = getWalletFromToken(authToken);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { sender_id, recipient_id, token, amount, message, transaction_hash } = await request.json();

    if (!sender_id || !recipient_id || !token || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the caller matches the claimed sender
    if (sender_id.toLowerCase() !== callerAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: caller does not match sender' }, { status: 403 });
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
