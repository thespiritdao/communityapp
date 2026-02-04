import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveService } from '@/services/googleDriveService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Handle Google OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/executive?error=${error}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/executive?error=no_code', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await GoogleDriveService.getTokensFromCode(code);

    // Store tokens in Supabase (agent_context table)
    await supabase
      .from('agent_context')
      .upsert({
        context_type: 'google_oauth',
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type,
          scope: tokens.scope,
        },
        updated_at: new Date().toISOString(),
      });

    // Redirect back to executive dashboard
    return NextResponse.redirect(
      new URL('/executive?google_connected=true', request.url)
    );
  } catch (error: any) {
    console.error('Google callback error:', error);
    return NextResponse.redirect(
      new URL(`/executive?error=${error.message}`, request.url)
    );
  }
}
