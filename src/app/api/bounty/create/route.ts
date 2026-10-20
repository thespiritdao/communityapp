import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
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
    const callerAddress = await getWalletFromToken(authToken);
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
      estimatedHours, // $SELF: poster's estimate of hours this bounty represents
      // Eligibility (migration 20261020000001). restriction_level is the
      // authority; required_pod_id null means not pod-restricted.
      restriction_level,
      required_pod_id,
      credential_gates,
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
      // $SELF earn anchor: hours this bounty represents, credited to the
      // completer on approval. Coerced to a non-negative number; 0/absent ⇒ no
      // $SELF credit (bounty still works, just earns nothing).
      estimated_hours: Math.max(0, Number(estimatedHours) || 0),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Who can apply. Three modes; anything unrecognised falls back to the
    // safest reading, members of the sponsoring pod.
    const level: 'public' | 'pod_members' | 'token_holders' =
      restriction_level === 'public' || restriction_level === 'token_holders'
        ? restriction_level
        : 'pod_members';
    const gates: Array<{ kind: string; id: string; name: string; minBalance?: number }> =
      level === 'token_holders' && Array.isArray(credential_gates)
        ? credential_gates
            .filter(
              (g: any) =>
                g &&
                ['pod', 'erc20', 'erc721', 'hat'].includes(g.kind) &&
                typeof g.id === 'string' &&
                g.id.trim() &&
                typeof g.name === 'string',
            )
            .slice(0, 20)
        : [];
    if (level === 'token_holders' && gates.length === 0) {
      return NextResponse.json(
        { error: 'Credential-gated bounties need at least one credential' },
        { status: 400 },
      );
    }

    // Add blockchain fields if they exist (after migration)
    if (hasBlockchainFields) {
      insertData.blockchain_id = bountyId;
      insertData.onchain_id = bountyId; // Add onchain_id field
      insertData.transaction_hash = transactionHash;
      insertData.pod_id = podId;
      insertData.restriction_level = level;
      insertData.required_pod_id =
        level === 'pod_members'
          ? (typeof required_pod_id === 'string' && required_pod_id) || podId
          : null;
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

    // Credential gates: written here with the service role (the browser has
    // no write policy on bounty_token_gates). A failure here must not lose
    // the bounty, which already exists on-chain; it is reported instead.
    let gateError: string | null = null;
    if (gates.length > 0) {
      const rows = gates.map((g) => ({
        bounty_id: data.id,
        token_type: g.kind,
        hat_id: g.kind === 'hat' ? Number(g.id) : null,
        hat_name: g.name.slice(0, 120),
        contract_address: g.kind === 'hat' ? null : g.id.trim().toLowerCase(),
        min_balance: Math.max(1, Number(g.minBalance) || 1),
      }));
      const { error: gErr } = await supabase.from('bounty_token_gates').insert(rows);
      if (gErr) {
        console.error('❌ Failed to save bounty credential gates:', gErr);
        gateError = gErr.message;
      }
    }

    return NextResponse.json({
      success: true,
      bounty: data,
      ...(gateError ? { warning: `Bounty saved but its credential gates were not: ${gateError}` } : {}),
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
