// src/app/api/auth/onchainkit/route.ts

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from 'src/utils/supabaseAdminClient';

/**
 * This route takes in a wallet address (already verified by OnchainKit).
 * It then generates a Supabase-compatible JWT and returns it to the client.
 */
export async function POST(req: NextRequest) {
  try {
    console.log('API Route: Received POST request to /api/auth/onchainkit');

    const body = await req.json();
    const { address } = body || {};

    console.log('API Route: Parsed request body:', body);

    // 1) Validate the address
    if (!address) {
      console.warn('API Route: No address provided in the request.');
      return NextResponse.json(
        { error: 'No address provided' },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();
    const dummyEmail = `${normalizedAddress}@wallet.com`;
    console.log(`API Route: Normalized wallet address: ${normalizedAddress}`);

    // 2) Check if the user exists in user_profiles
    console.log('API Route: Checking if user exists in user_profiles...');
    let { data: userProfile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('wallet_address', normalizedAddress)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
      console.error('API Route: Error fetching user profile:', error);
      throw error;
    }

    let userId: string | null = null;

    if (userProfile) {
      // Existing user flow
      userId = userProfile.user_id;
      console.log(`API Route: Existing user found with user_id: ${userId}`);

      // 3) Verify if user exists in auth.users
      console.log('API Route: Verifying if user exists in auth.users...');
      const { data: authUser, error: authUserError } = await supabaseAdmin
        .auth.admin.getUserById(userId);

      if (authUserError) {
        console.error('API Route: Error verifying user in auth.users:', authUserError);
        throw authUserError;
      }

      if (!authUser || !authUser.user) {
        console.log(`API Route: No user found in auth.users with id: ${userId}. Creating new user...`);
        // Create auth user with existing user_id
        const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          id: userId,
          email: dummyEmail,
          email_confirm: true,
          user_metadata: { wallet_address: normalizedAddress }
        });

        if (createUserError) {
          console.error('API Route: Error creating new user in auth.users:', createUserError);
          throw createUserError;
        }

        userId = newUser.user.id;
        console.log(`API Route: New user created in auth.users with id: ${userId}`);
      }
    } else {
      // New user flow
      console.log('API Route: No existing user found. Checking for existing auth user...');

      // First check if a user with this email already exists
      const { data: existingUser, error: existingUserError } = await supabaseAdmin
        .auth.admin.listUsers();

      const existingAuthUser = existingUser?.users?.find(user => user.email === dummyEmail);

      if (existingAuthUser) {
        userId = existingAuthUser.id;
        console.log(`API Route: Found existing auth user with id: ${userId}`);

        // Create user_profiles entry if it doesn't exist
        const { error: insertProfileError } = await supabaseAdmin
          .from('user_profiles')
          .upsert([{ 
            user_id: userId, 
            wallet_address: normalizedAddress 
          }], {
            onConflict: 'user_id'
          });

        if (insertProfileError) {
          console.error('API Route: Error upserting user_profiles:', insertProfileError);
          throw insertProfileError;
        }
      } else {
        // Create new auth user
        const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: dummyEmail,
          email_confirm: true,
          user_metadata: { wallet_address: normalizedAddress }
        });

        if (createUserError) {
          console.error('API Route: Error creating new user in auth.users:', createUserError);
          throw createUserError;
        }

        if (!newUser?.user?.id) {
          throw new Error('Failed to create new user');
        }

        userId = newUser.user.id;
        console.log(`API Route: New user created with user_id: ${userId}`);

        // Create user_profiles entry
        const { error: insertProfileError } = await supabaseAdmin
          .from('user_profiles')
          .insert([{ 
            user_id: userId, 
            wallet_address: normalizedAddress 
          }]);

        if (insertProfileError) {
          console.error('API Route: Error inserting into user_profiles:', insertProfileError);
          throw insertProfileError;
        }
      }
    }

    if (!userId) {
      console.error('API Route: Failed to retrieve or create user ID.');
      throw new Error('Failed to retrieve or create user ID.');
    }

    // Generate JWT tokens
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('API Route: Missing SUPABASE_JWT_SECRET in environment variables.');
      return NextResponse.json(
        { error: 'Missing SUPABASE_JWT_SECRET' },
        { status: 500 }
      );
    }

    const userClaims = {
      aud: 'authenticated',
      role: 'authenticated'
    };

    const jwtPayload = { sub: userId, ...userClaims };
    console.log('API Route: JWT Payload:', jwtPayload);

    const supabaseToken = jwt.sign(
      jwtPayload,
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    const supabaseRefreshToken = jwt.sign(
      jwtPayload,
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('API Route: Generated tokens successfully.');

    return NextResponse.json({ supabaseToken, supabaseRefreshToken });
  } catch (err) {
    console.error('API Route: Error generating Supabase token:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}