/**
 * Governance Enforcement Service
 *
 * Multi-layered defense strategy for role-based access control
 * Combines database governance with on-chain HAT verification
 *
 * Security Model:
 * - Layer 1: Database flags (fast, mutable)
 * - Layer 2: On-chain HAT balance (slow, immutable)
 * - Layer 3: Eligibility modules (future, maximum security)
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supabase } from '@/lib/supabase';

// Hats Protocol contract
const HATS_CONTRACT_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

// Executive Pod HAT IDs
const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
const EXEC_MANAGEMENT_HAT_ID = '0x0000008800010000000000000000000000000000000000000000000000000000';

// Hats ABI (minimal for balanceOf)
const HATS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' }
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Viem client for on-chain reads
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

export class GovernanceEnforcementService {
  /**
   * Check if address can approve burn requests
   * HIGH SECURITY: Uses both database and on-chain verification
   */
  static async canApproveBurnRequest(walletAddress: string): Promise<{
    authorized: boolean;
    reason?: string;
    layers: {
      database: boolean;
      onchain: boolean;
    };
  }> {
    const startTime = Date.now();

    try {
      // Layer 1: Database governance check (fast)
      const { data: member, error: dbError } = await supabase
        .from('pod_members')
        .select('revoked_by_governance, membership_type')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('pod_id', EXEC_POD_ID)
        .maybeSingle();

      const databaseAuthorized = !dbError &&
                                 !member?.revoked_by_governance &&
                                 member?.membership_type === 'leader';

      if (!databaseAuthorized) {
        console.log('❌ Database check failed:', {
          wallet: walletAddress,
          revoked: member?.revoked_by_governance,
          type: member?.membership_type,
          duration: Date.now() - startTime,
        });

        return {
          authorized: false,
          reason: member?.revoked_by_governance
            ? 'Revoked by governance'
            : 'Not an executive pod leader',
          layers: {
            database: false,
            onchain: false, // Skip on-chain check if DB fails
          },
        };
      }

      // Layer 2: On-chain HAT verification (slower but authoritative)
      const hatBalance = await publicClient.readContract({
        address: HATS_CONTRACT_ADDRESS,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`, BigInt(EXEC_MANAGEMENT_HAT_ID)],
      });

      const onchainAuthorized = hatBalance > 0n;

      console.log('🔍 Governance check complete:', {
        wallet: walletAddress,
        database: databaseAuthorized,
        onchain: onchainAuthorized,
        hatBalance: hatBalance.toString(),
        duration: Date.now() - startTime,
      });

      // If on-chain check fails but DB says authorized, sync the DB
      if (!onchainAuthorized && databaseAuthorized) {
        console.warn('⚠️ Database out of sync - updating to match on-chain reality');

        await supabase
          .from('pod_members')
          .update({ revoked_by_governance: true })
          .eq('wallet_address', walletAddress.toLowerCase())
          .eq('pod_id', EXEC_POD_ID);
      }

      return {
        authorized: databaseAuthorized && onchainAuthorized,
        reason: !onchainAuthorized ? 'No management HAT on-chain' : undefined,
        layers: {
          database: databaseAuthorized,
          onchain: onchainAuthorized,
        },
      };

    } catch (error) {
      console.error('❌ Governance check failed:', error);

      // Fail closed: Deny access on errors
      return {
        authorized: false,
        reason: 'Governance check error',
        layers: {
          database: false,
          onchain: false,
        },
      };
    }
  }

  /**
   * Check if address can manage treasury
   * MEDIUM SECURITY: Database check + optional on-chain verification
   */
  static async canManageTreasury(
    walletAddress: string,
    podId: string,
    options: { verifyOnChain?: boolean } = {}
  ): Promise<boolean> {
    try {
      // Database check
      const { data: member } = await supabase
        .from('pod_members')
        .select('revoked_by_governance, membership_type')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('pod_id', podId)
        .maybeSingle();

      if (member?.revoked_by_governance) {
        return false;
      }

      if (member?.membership_type !== 'leader') {
        return false;
      }

      // Optional on-chain verification (skip for performance)
      if (options.verifyOnChain && podId === EXEC_POD_ID) {
        const hatBalance = await publicClient.readContract({
          address: HATS_CONTRACT_ADDRESS,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`, BigInt(EXEC_MANAGEMENT_HAT_ID)],
        });

        return hatBalance > 0n;
      }

      return true;

    } catch (error) {
      console.error('❌ Treasury permission check failed:', error);
      return false; // Fail closed
    }
  }

  /**
   * Propose revoking a leader's authority
   * Creates governance proposal in database
   */
  static async proposeLeaderRevocation(
    targetWallet: string,
    proposerWallet: string,
    reason: string
  ): Promise<string> {
    // Verify proposer is authorized
    const { authorized } = await this.canApproveBurnRequest(proposerWallet);
    if (!authorized) {
      throw new Error('Only executive pod leaders can propose revocations');
    }

    // Can't revoke yourself
    if (targetWallet.toLowerCase() === proposerWallet.toLowerCase()) {
      throw new Error('Cannot propose self-revocation (use renounceHat instead)');
    }

    // Create proposal
    const { data, error } = await supabase
      .from('exec_pod_revocation_proposals')
      .insert({
        target_wallet: targetWallet.toLowerCase(),
        proposed_by: proposerWallet.toLowerCase(),
        reason,
        status: 'pending',
        votes_for: [proposerWallet.toLowerCase()], // Proposer auto-votes
        votes_against: [],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create revocation proposal: ${error.message}`);
    }

    console.log('📋 Revocation proposal created:', {
      proposalId: data.id,
      target: targetWallet,
      proposer: proposerWallet,
      reason,
    });

    // TODO: Notify other exec pod members

    return data.id;
  }

  /**
   * Vote on a revocation proposal
   * Requires 2 of 3 leaders to approve
   */
  static async voteOnRevocation(
    proposalId: string,
    voterWallet: string,
    vote: 'for' | 'against'
  ): Promise<{ executed: boolean; status: string }> {
    // Verify voter is authorized
    const { authorized } = await this.canApproveBurnRequest(voterWallet);
    if (!authorized) {
      throw new Error('Only executive pod leaders can vote');
    }

    // Get proposal
    const { data: proposal, error: fetchError } = await supabase
      .from('exec_pod_revocation_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Proposal already ${proposal.status}`);
    }

    // Check if expired
    if (new Date(proposal.expires_at) < new Date()) {
      await supabase
        .from('exec_pod_revocation_proposals')
        .update({ status: 'expired' })
        .eq('id', proposalId);

      throw new Error('Proposal has expired');
    }

    // Update votes
    const votesFor = vote === 'for'
      ? [...new Set([...proposal.votes_for, voterWallet.toLowerCase()])]
      : proposal.votes_for;

    const votesAgainst = vote === 'against'
      ? [...new Set([...proposal.votes_against, voterWallet.toLowerCase()])]
      : proposal.votes_against;

    // Check threshold (2 of 3 leaders)
    const THRESHOLD = 2;
    const executed = votesFor.length >= THRESHOLD;

    if (executed) {
      // Execute revocation
      await supabase
        .from('pod_members')
        .update({
          revoked_by_governance: true,
          revoked_at: new Date().toISOString(),
        })
        .eq('wallet_address', proposal.target_wallet)
        .eq('pod_id', EXEC_POD_ID);

      // Update proposal status
      await supabase
        .from('exec_pod_revocation_proposals')
        .update({
          status: 'approved',
          votes_for: votesFor,
          votes_against: votesAgainst,
          executed_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      console.log('✅ Revocation executed:', {
        proposalId,
        target: proposal.target_wallet,
        votesFor: votesFor.length,
      });

      return { executed: true, status: 'approved' };
    } else {
      // Just update votes
      await supabase
        .from('exec_pod_revocation_proposals')
        .update({
          votes_for: votesFor,
          votes_against: votesAgainst,
        })
        .eq('id', proposalId);

      console.log('📊 Vote recorded:', {
        proposalId,
        vote,
        votesFor: votesFor.length,
        votesAgainst: votesAgainst.length,
        threshold: THRESHOLD,
      });

      return { executed: false, status: 'pending' };
    }
  }

  /**
   * Get all pending revocation proposals
   */
  static async getPendingRevocations(): Promise<any[]> {
    const { data, error } = await supabase
      .from('exec_pod_revocation_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch proposals:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Restore a revoked leader (requires same voting process)
   */
  static async restoreLeader(
    targetWallet: string,
    proposerWallet: string,
    reason: string
  ): Promise<string> {
    // Similar to proposeLeaderRevocation but creates restoration proposal
    const { authorized } = await this.canApproveBurnRequest(proposerWallet);
    if (!authorized) {
      throw new Error('Only executive pod leaders can propose restoration');
    }

    const { data, error } = await supabase
      .from('exec_pod_restoration_proposals')
      .insert({
        target_wallet: targetWallet.toLowerCase(),
        proposed_by: proposerWallet.toLowerCase(),
        reason,
        status: 'pending',
        votes_for: [proposerWallet.toLowerCase()],
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create restoration proposal: ${error.message}`);
    }

    return data.id;
  }
}
