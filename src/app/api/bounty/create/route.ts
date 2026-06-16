import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate caller via JWT
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callerAddress = getWalletFromToken(authToken);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();

    const {
      bountyId,
      transactionHash,
      creator,
      value,
      token,
      podId,
      ipfsHash,
      title,
      description,
      category,
      deadline,
      funding_source,
      requirements,
      tasks,
      questions,
      status, // Accept status from request body
    } = body;

    // Verify the caller matches the claimed creator
    if (creator.toLowerCase() !== callerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Forbidden: caller does not match creator' },
        { status: 403 },
      );
    }

    console.log('📝 Saving bounty to database:', {
      bountyId,
      transactionHash,
      creator,
      podId,
    });

    // Determine token name for value_token field
    const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string;
    const valueToken =
      token.toLowerCase() === SYSTEM_TOKEN?.toLowerCase()
        ? 'SYSTEM'
        : 'SELF';

    // Check if blockchain fields exist in schema
    const { error: schemaError } = await supabase
      .from('bounties')
      .select('blockchain_id')
      .limit(0);

    const hasBlockchainFields = !schemaError;

    // Prepare insert data with current schema columns
    const insertData: any = {
      title: title,
      description: description,
      category: category,
      value_amount: value,
      value_token: valueToken,
      requirements: requirements || [],
      tasks: tasks || [],
      questions: questions || [],
      status: status || 'open', // Use status from request, default to 'open' for backwards compatibility
      creator_address: creator,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add blockchain fields if they exist (after migration)
    if (hasBlockchainFields) {
      insertData.blockchain_id = bountyId;
      insertData.onchain_id = bountyId; // Add onchain_id field
      insertData.transaction_hash = transactionHash;
      insertData.pod_id = podId;
      insertData.required_pod_id = podId; // Add required_pod_id (bounty restricted to this pod)
      insertData.ipfs_hash = ipfsHash;
      insertData.funding_source = funding_source || 'wallet';
      insertData.payment_type = 'completion';
      insertData.deadline = deadline ? new Date(deadline).toISOString() : null;
    }

    console.log(
      '📋 Insert data prepared (hasBlockchainFields:',
      hasBlockchainFields,
      ')',
    );

    // Insert bounty into database
    const { data, error } = await supabase
      .from('bounties')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving bounty to database:', error);
      return NextResponse.json(
        { error: 'Failed to save bounty to database', details: error.message },
        { status: 500 },
      );
    }

    console.log('✅ Bounty saved to database:', data);

    return NextResponse.json({
      success: true,
      bounty: data,
    });
  } catch (error) {
    console.error('❌ Error in bounty creation API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
