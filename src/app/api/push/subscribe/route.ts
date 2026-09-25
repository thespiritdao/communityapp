import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate caller via JWT
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callerAddress = await getWalletFromToken(authToken);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { subscription, user_address } = await request.json();

    if (!subscription?.endpoint || !user_address) {
      return NextResponse.json({ error: 'Missing subscription or user_address' }, { status: 400 });
    }

    // Verify the caller matches the claimed user_address
    if (user_address.toLowerCase() !== callerAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: caller does not match user_address' }, { status: 403 });
    }

    const { endpoint, keys } = subscription;

    await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        {
          user_address: callerAddress.toLowerCase(),
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: 'endpoint' },
      );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[push/subscribe] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Authenticate caller via JWT
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callerAddress = await getWalletFromToken(authToken);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

    // Only allow deleting subscriptions belonging to the caller
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_address', callerAddress.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
