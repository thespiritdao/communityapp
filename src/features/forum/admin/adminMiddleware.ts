// src/app/features/forum/admin/adminMiddleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchUnifiedTokenBalances } from 'src/utils/tokenGateService';

export async function middleware(request: NextRequest) {
  // Only apply on admin routes
  if (!request.nextUrl.pathname.startsWith('/forum/admin')) {
    return NextResponse.next();
  }

  // Get wallet address from header or cookie (similar to your existing logic)
  const authHeader = request.headers.get('authorization');
  const walletAddress = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : getCookieValue(request.cookies.get('walletAddress')?.value);

  if (!walletAddress) {
    return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
  }

  try {
    // Check unified token balances
    const { hasERC1155Admin } = await fetchUnifiedTokenBalances(walletAddress);
    if (!hasERC1155Admin) {
      return NextResponse.redirect(new URL('/access-denied', request.url));
    }
    return NextResponse.next();
  } catch (error) {
    console.error('Admin token verification error:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

// Helper to safely extract cookie value
function getCookieValue(cookieValue: string | undefined): string | undefined {
  if (!cookieValue) return undefined;
  try {
    return decodeURIComponent(cookieValue);
  } catch {
    return cookieValue;
  }
}

export const config = {
  matcher: ['/forum/admin/:path*'],
};
