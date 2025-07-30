// src/features/forum/admin/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchExtendedTokenBalances } from '@/utils/fetchTokenBalances';

// Helper to extract cookie value (same as our existing helper)
function getCookieValue(cookieValue: string | undefined): string | undefined {
  if (!cookieValue) return undefined;
  try {
    return decodeURIComponent(cookieValue);
  } catch {
    return cookieValue;
  }
}

export async function middleware(request: NextRequest) {
  // Only apply to admin routes under /forum/admin
  if (!request.nextUrl.pathname.startsWith('/forum/admin')) {
    return NextResponse.next();
  }

  // Get wallet address from authorization header or cookie
  const authHeader = request.headers.get('authorization');
  const walletAddress = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : getCookieValue(request.cookies.get('walletAddress')?.value);

  if (!walletAddress) {
    // Redirect to login if wallet address is not found
    return NextResponse.redirect(
      new URL('/login?redirect=' + encodeURIComponent(request.nextUrl.pathname), request.url)
    );
  }

  try {
    // Use our extended token balances function to check for the Market Management Hat token.
    // Check if user has the market management hat from the HATS contract
    const { hasERC1155Token } = await fetchExtendedTokenBalances(
      walletAddress,
      process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
      parseInt(process.env.NEXT_PUBLIC_MARKET_MANAGEMENT || '0', 16)
    );

    if (!hasERC1155Token) {
      // Redirect to access denied if user does not hold the admin token.
      return NextResponse.redirect(new URL('/access-denied', request.url));
    }

    // Wallet holds the required admin token; proceed.
    return NextResponse.next();
  } catch (error) {
    console.error('Admin token verification error:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

export const config = {
  matcher: ['/forum/admin/:path*']
};
