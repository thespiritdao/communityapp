import { NextResponse } from 'next/server';

/**
 * GET /api/donations/check-config
 *
 * Diagnostic endpoint to check if Stripe environment variables are configured
 * Does NOT expose actual keys, just checks if they exist
 */
export async function GET() {
  const checks = {
    NEXT_PUBLIC_STRIPE_SYSTEM_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_SYSTEM_PUBLISHABLE_KEY,
    STRIPE_SYSTEM_DONATION_KEY: !!process.env.STRIPE_SYSTEM_DONATION_KEY,
    STRIPE_SYSTEM_WEBHOOK_SECRET: !!process.env.STRIPE_SYSTEM_WEBHOOK_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    CDP_API_KEY: !!process.env.CDP_API_KEY,
    EXECUTIVE_MINTING_PRIVATE_KEY: !!process.env.EXECUTIVE_MINTING_PRIVATE_KEY,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
  };

  const keyPrefixes = {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_SYSTEM_PUBLISHABLE_KEY?.substring(0, 10) || 'MISSING',
    secretKey: process.env.STRIPE_SYSTEM_DONATION_KEY?.substring(0, 10) || 'MISSING',
  };

  const allConfigured = Object.values(checks).every(Boolean);

  return NextResponse.json({
    configured: allConfigured,
    checks,
    keyPrefixes,
    environment: process.env.NODE_ENV,
    message: allConfigured
      ? '✅ All required environment variables are configured'
      : '❌ Missing some required environment variables'
  });
}
