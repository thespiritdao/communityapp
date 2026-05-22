// Helper for inserting a row into proposal_metadata immediately after
// submitting an on-chain proposal. Used by both CreateProposalForm (the
// general DAO-wide proposal flow) and DAOGovernanceSettingsCard (the
// governance-parameter-change flow). Keeps the insert + mention-parsing
// logic in one place so the two call sites can't drift.
//
// The row is created with a temporary onchain_proposal_id (a 'temp_'
// prefix derived from the user-operation hash). A background cron later
// resolves the real on-chain proposal id and updates the row.

import { supabase } from '@/utils/supabaseClient';

/**
 * Extract @[name](address) mentions from a markdown-style proposal body.
 * Returns the addresses (the second capture group).
 */
function extractMentions(body: string): string[] {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[2]);
  }
  return out;
}

export interface InsertProposalMetadataArgs {
  /** Temp id derived from the userOp hash, e.g. `temp_abc12345`. */
  tempProposalId: string;
  title: string;
  description: string;
  proposerAddress: string;
  forumThreadId?: string | null;
  /**
   * Which token / pod this proposal is scoped to. For DAO-wide proposals
   * this is `'dao-wide'`. For pod-level proposals it's the pod UUID.
   */
  tokenId?: string | null;
  transactionHash: string;
  /**
   * If true, skip the insert when a row already exists with this temp id.
   * Defaults to true — protects against accidental double-submission.
   */
  skipIfExists?: boolean;
}

/**
 * Insert a proposal_metadata row. Idempotent on tempProposalId when
 * skipIfExists is true (default). Returns true if a row was inserted,
 * false if skipped due to existing row.
 */
export async function insertProposalMetadata(
  args: InsertProposalMetadataArgs,
): Promise<boolean> {
  const {
    tempProposalId,
    title,
    description,
    proposerAddress,
    forumThreadId,
    tokenId,
    transactionHash,
    skipIfExists = true,
  } = args;

  if (skipIfExists) {
    const { data: existing, error: checkError } = await supabase
      .from('proposal_metadata')
      .select('id')
      .eq('onchain_proposal_id', tempProposalId)
      .maybeSingle();

    if (checkError) {
      // Don't block the insert on a read error; just log and proceed.
      console.warn(
        '⚠️ [insertProposalMetadata] dedup check failed; proceeding to insert',
        checkError,
      );
    } else if (existing) {
      console.log(
        '↩️ [insertProposalMetadata] row already exists; skipping insert',
        tempProposalId,
      );
      return false;
    }
  }

  const mentions = extractMentions(description);

  const { error } = await supabase.from('proposal_metadata').insert([
    {
      onchain_proposal_id: tempProposalId,
      title,
      description,
      proposer_address: proposerAddress,
      forum_thread_id: forumThreadId ?? null,
      token_id: tokenId ?? null,
      created_at: new Date().toISOString(),
      transaction_hash: transactionHash,
      mentions,
      status: 'active',
    },
  ]);

  if (error) {
    console.error('❌ [insertProposalMetadata] insert failed:', error);
    throw error;
  }
  console.log(
    '✅ [insertProposalMetadata] inserted row with temp id',
    tempProposalId,
  );
  return true;
}
