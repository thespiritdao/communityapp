// API Route: Sync a single vote to database immediately after user votes
// This provides instant UI feedback without waiting for blockchain confirmation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proposalId, voter, choice, votingPower = 1, txHash } = body;

    if (!proposalId || !voter || choice === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log(`📥 API: Syncing vote - Proposal ${proposalId.substring(0, 20)}..., Voter ${voter.substring(0, 10)}..., Choice ${choice}`);

    // 1. Insert or update individual vote
    const { error: voteError } = await supabaseAdmin
      .from('governance_user_votes')
      .upsert({
        proposal_id: proposalId,
        voter_address: voter.toLowerCase(),
        choice,
        voting_power: votingPower.toString(),
        tx_hash: txHash || null,
        voted_at: new Date().toISOString(),
      }, {
        onConflict: 'proposal_id,voter_address',
      });

    if (voteError) {
      console.error('❌ API: Failed to insert user vote:', voteError);
      return NextResponse.json(
        { error: voteError.message },
        { status: 500 }
      );
    }

    // 2. Aggregate all votes for this proposal
    const { data: allVotes, error: aggregateError } = await supabaseAdmin
      .from('governance_user_votes')
      .select('choice, voting_power')
      .eq('proposal_id', proposalId);

    if (aggregateError) {
      console.error('❌ API: Failed to aggregate votes:', aggregateError);
      return NextResponse.json(
        { error: aggregateError.message },
        { status: 500 }
      );
    }

    // Calculate totals
    let forVotes = 0n;
    let againstVotes = 0n;
    let abstainVotes = 0n;

    for (const vote of allVotes || []) {
      const power = BigInt(vote.voting_power || 1);
      if (vote.choice === 1) forVotes += power;
      else if (vote.choice === 0) againstVotes += power;
      else if (vote.choice === 2) abstainVotes += power;
    }

    const totalVotes = forVotes + againstVotes + abstainVotes;

    console.log(`📊 API: Aggregated votes:`, {
      for: forVotes.toString(),
      against: againstVotes.toString(),
      abstain: abstainVotes.toString(),
      total: totalVotes.toString(),
    });

    // 3. Update proposal vote counts
    const { error: updateError } = await supabaseAdmin
      .from('governance_proposal_votes')
      .upsert({
        proposal_id: proposalId,
        for_votes: forVotes.toString(),
        against_votes: againstVotes.toString(),
        abstain_votes: abstainVotes.toString(),
        total_votes: totalVotes.toString(),
      }, {
        onConflict: 'proposal_id',
      });

    if (updateError) {
      console.error('❌ API: Failed to update proposal vote counts:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    console.log(`✅ API: Successfully synced vote for proposal ${proposalId.substring(0, 20)}...`);

    return NextResponse.json({
      success: true,
      voteCounts: {
        for: forVotes.toString(),
        against: againstVotes.toString(),
        abstain: abstainVotes.toString(),
        total: totalVotes.toString(),
      },
    });
  } catch (error: any) {
    console.error('❌ API: Failed to sync vote:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync vote' },
      { status: 500 }
    );
  }
}
