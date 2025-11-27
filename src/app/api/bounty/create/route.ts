import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
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
      questions
    } = body;

    console.log('📝 Saving bounty to database:', {
      bountyId,
      transactionHash,
      creator,
      podId
    });

    // Determine token name for value_token field
    const valueToken = token === '0x1317Ae277266D38C4E492558f8693F14143a6A65' ? 'SYSTEM' : 'SELF';

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
      questions: questions || [],
      status: 'open',
      creator_address: creator,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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

    console.log('📋 Insert data prepared (hasBlockchainFields:', hasBlockchainFields, ')');

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
        { status: 500 }
      );
    }

    console.log('✅ Bounty saved to database:', data);

    return NextResponse.json({
      success: true,
      bounty: data
    });

  } catch (error) {
    console.error('❌ Error in bounty creation API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
