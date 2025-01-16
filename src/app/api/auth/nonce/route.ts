import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// In-memory store for demonstration. In production, store per wallet address.
export const nonceStore: Record<string, string> = {};

export async function GET(_req: NextRequest) {
  // 1) Generate a random nonce
  const nonce = `Sign in to MyApp: ${randomBytes(16).toString('hex')}`;

  // 2) Store it under a placeholder. (Real app => store with address key)
  nonceStore['placeholder'] = nonce;

  // 3) Return the nonce as JSON
  return NextResponse.json({ nonce });
}
