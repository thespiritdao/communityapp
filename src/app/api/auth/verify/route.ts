import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { nonceStore } from '../nonce/route';

/**
 * POST /api/auth/verify
 * Expects { address, signature } in the JSON body.
 */
export async function POST(request: NextRequest) {
  try {
    // 1) Parse the incoming JSON from the request
    const { address, signature } = await request.json() || {};

    if (!address || !signature) {
      return NextResponse.json(
        { error: 'Missing address or signature' },
        { status: 400 }
      );
    }

    // 2) Retrieve the nonce from the store (placeholder in-memory approach)
    const tempAddress = 'placeholder';
    const nonce = nonceStore[tempAddress];
    if (!nonce) {
      return NextResponse.json(
        { error: 'No nonce found. Did you request one via /api/auth/nonce?' },
        { status: 400 }
      );
    }

    // 3) Verify the signature
    const recoveredAddr = ethers.utils.verifyMessage(nonce, signature);
    if (recoveredAddr.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // (Optional) Clear the used nonce so it can’t be reused
    delete nonceStore[tempAddress];

    // 4) Load the Supabase JWT secret from environment
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_JWT_SECRET on server' },
        { status: 500 }
      );
    }

    // 5) Generate a custom JWT recognized by Supabase as "authenticated"
    // In production, you may want to add "aud: 'authenticated'"
    const supabaseToken = jwt.sign(
      { wallet_address: address.toLowerCase() },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    // 6) Return the token
    return NextResponse.json({ supabaseToken });
  } catch (err) {
    console.error('Error verifying signature or issuing token:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
