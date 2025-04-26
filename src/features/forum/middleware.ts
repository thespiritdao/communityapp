// src/app/features/forum/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from 'src/utils/supabaseAdminClient';
import { fetchTokenBalances } from 'src/utils/fetchTokenBalances';

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (!request.nextUrl.pathname.startsWith('/forum')) {
    return NextResponse.next();
  }

  const userId = request.cookies.get('userId')?.value; 
  if (!userId) {
    return NextResponse.redirect(
      new URL('/login?redirect=' + encodeURIComponent(request.nextUrl.pathname), request.url)
    );
  }

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', userId)
      .single();

    // Enforce valid on-chain wallet address
    if (profileError || !profile?.wallet_address || !profile.wallet_address.startsWith('0x')) {
      return NextResponse.redirect(
        new URL('/error?msg=' + encodeURIComponent('No valid wallet address found'), request.url)
      );
    }

    const walletAddress = profile.wallet_address;

    const hasAccess = await verifyAccess(walletAddress);
    if (!hasAccess) {
      return NextResponse.redirect(new URL('/access-denied', request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

async function verifyAccess(walletAddress: string): Promise<boolean> {
  if (!walletAddress) return false;
  try {
    const { hasProofOfCuriosity } = await fetchTokenBalances(walletAddress);
    return hasProofOfCuriosity;
  } catch (error) {
    console.error('Error checking token balance:', error);
    return false;
  }
}

export const config = {
  matcher: ['/forum/:path*'],
};
