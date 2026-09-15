// src/app/api/debug/contract-addresses/route.ts
//
// Which contract addresses is THIS server running with? Every NEXT_PUBLIC_*
// variable whose value is an EVM address, as the server process sees it.
//
// Exists because a developer machine and production were found pointing at
// different eligibility modules (APP_AUDIT_2026-09-15, F12), and the Vercel
// API returns env values encrypted. These are public contract addresses — the
// same ones inlined into the client bundle — so nothing here is secret. Only
// NEXT_PUBLIC_ keys are read; nothing else in the environment is exposed.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('NEXT_PUBLIC_') && typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim())) {
      out[k] = v.trim();
    }
  }
  return NextResponse.json(
    { count: Object.keys(out).length, addresses: out, checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
