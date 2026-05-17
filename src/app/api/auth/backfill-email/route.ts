// src/app/api/auth/backfill-email/route.ts
// Backfills email for users who authenticated without one (e.g. Google OAuth race condition).
// Updates user_profiles and subscribes to Paragraph mailing list.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, email } = await req.json();

    if (!walletAddress || !email) {
      return NextResponse.json(
        { error: 'walletAddress and email are required' },
        { status: 400 },
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Find the user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, email')
      .eq('wallet_address', normalizedAddress)
      .maybeSingle();

    if (profileError) {
      console.error('❌ Backfill-email: DB error:', profileError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Update email if not already set
    let emailUpdated = false;
    if (!profile.email) {
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ email })
        .eq('wallet_address', normalizedAddress)
        .is('email', null);

      if (updateError) {
        console.error('❌ Backfill-email: Failed to update email:', updateError);
      } else {
        emailUpdated = true;
        console.log(`✅ Backfill-email: Updated profile ${normalizedAddress} with email: ${email}`);
      }
    }

    // Subscribe to Paragraph mailing list (always attempt — idempotent)
    let subscribed = false;
    try {
      const paragraphApiKey = process.env.PARAGRAPH_API;
      if (paragraphApiKey) {
        const paragraphRes = await fetch('https://public.api.paragraph.com/api/v1/subscribers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${paragraphApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });
        if (!paragraphRes.ok) {
          const errBody = await paragraphRes.text();
          console.error(`⚠️ Backfill-email: Paragraph subscription failed (${paragraphRes.status}): ${errBody}`);
        } else {
          subscribed = true;
          console.log(`✅ Backfill-email: Subscribed ${email} to Paragraph`);
        }
      }
    } catch (paragraphError) {
      console.error('⚠️ Backfill-email: Paragraph subscription error (non-critical):', paragraphError);
    }

    return NextResponse.json({ emailUpdated, subscribed });
  } catch (err) {
    console.error('❌ Backfill-email: Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
