// src/features/forum/services/PollService.ts

import { supabase } from '@/utils/supabaseClient';

/**
 * Forum Poll Service
 *
 * Handles poll creation, voting, and results
 */

export interface Poll {
  id: string;
  thread_id: string;
  question: string;
  options: PollOption[];
  allow_multiple: boolean;
  expires_at?: string;
  created_by: string;
  created_at: string;
  total_votes?: number;
}

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  vote_count: number;
  option_order: number;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_id: string;
  voter_address: string;
  created_at: string;
}

export interface PollResults {
  poll: Poll;
  options: (PollOption & { percentage: number })[];
  totalVotes: number;
  userVotes: string[]; // option_ids the user voted for
  hasExpired: boolean;
}

// ============================================================================
// POLL CREATION
// ============================================================================

/**
 * Create a new poll attached to a thread
 */
export async function createPoll(
  threadId: string,
  question: string,
  options: string[],
  creatorAddress: string,
  allowMultiple = false,
  expiresInDays?: number
): Promise<{ success: boolean; pollId?: string; error?: string }> {
  try {
    if (options.length < 2) {
      return { success: false, error: 'Poll must have at least 2 options' };
    }

    if (options.length > 10) {
      return { success: false, error: 'Poll cannot have more than 10 options' };
    }

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Create poll
    const { data: pollData, error: pollError } = await supabase
      .from('forum_polls')
      .insert({
        thread_id: threadId,
        question,
        allow_multiple: allowMultiple,
        expires_at: expiresAt,
        created_by: creatorAddress.toLowerCase()
      })
      .select()
      .single();

    if (pollError) throw pollError;

    // Create poll options
    const pollOptions = options.map((optionText, index) => ({
      poll_id: pollData.id,
      option_text: optionText,
      option_order: index
    }));

    const { error: optionsError } = await supabase
      .from('forum_poll_options')
      .insert(pollOptions);

    if (optionsError) throw optionsError;

    return { success: true, pollId: pollData.id };
  } catch (error: any) {
    console.error('Error creating poll:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// POLL VOTING
// ============================================================================

/**
 * Submit a vote for a poll option
 */
export async function votePoll(
  pollId: string,
  optionIds: string[], // Array to support multiple choice
  voterAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if poll exists and is not expired
    const { data: poll, error: pollError } = await supabase
      .from('forum_polls')
      .select('*, forum_poll_options(*)')
      .eq('id', pollId)
      .single();

    if (pollError) throw pollError;

    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return { success: false, error: 'Poll has expired' };
    }

    // Check if user already voted
    const { data: existingVotes } = await supabase
      .from('forum_poll_votes')
      .select('*')
      .eq('poll_id', pollId)
      .eq('voter_address', voterAddress.toLowerCase());

    if (existingVotes && existingVotes.length > 0) {
      return { success: false, error: 'You have already voted on this poll' };
    }

    // Validate option IDs
    const validOptionIds = poll.forum_poll_options.map((opt: any) => opt.id);
    const invalidOptions = optionIds.filter(id => !validOptionIds.includes(id));
    if (invalidOptions.length > 0) {
      return { success: false, error: 'Invalid poll option' };
    }

    // Check multiple choice restriction
    if (!poll.allow_multiple && optionIds.length > 1) {
      return { success: false, error: 'This poll only allows one choice' };
    }

    // Insert votes
    const votes = optionIds.map(optionId => ({
      poll_id: pollId,
      option_id: optionId,
      voter_address: voterAddress.toLowerCase()
    }));

    const { error: voteError } = await supabase
      .from('forum_poll_votes')
      .insert(votes);

    if (voteError) throw voteError;

    return { success: true };
  } catch (error: any) {
    console.error('Error voting on poll:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Change vote (remove old vote and add new one)
 */
export async function changeVote(
  pollId: string,
  newOptionIds: string[],
  voterAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Remove existing votes
    const { error: deleteError } = await supabase
      .from('forum_poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('voter_address', voterAddress.toLowerCase());

    if (deleteError) throw deleteError;

    // Submit new votes
    return await votePoll(pollId, newOptionIds, voterAddress);
  } catch (error: any) {
    console.error('Error changing vote:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// POLL RESULTS
// ============================================================================

/**
 * Get poll results with vote counts and percentages
 */
export async function getPollResults(
  pollId: string,
  userAddress?: string
): Promise<{ success: boolean; results?: PollResults; error?: string }> {
  try {
    // Get poll with options
    const { data: poll, error: pollError } = await supabase
      .from('forum_polls')
      .select(`
        *,
        forum_poll_options (*)
      `)
      .eq('id', pollId)
      .single();

    if (pollError) throw pollError;

    // Get all votes
    const { data: votes, error: votesError } = await supabase
      .from('forum_poll_votes')
      .select('option_id, voter_address')
      .eq('poll_id', pollId);

    if (votesError) throw votesError;

    // Calculate vote counts
    const voteCounts: Record<string, number> = {};
    votes?.forEach(vote => {
      voteCounts[vote.option_id] = (voteCounts[vote.option_id] || 0) + 1;
    });

    const totalVotes = votes?.length || 0;

    // Build options with percentages
    const options = poll.forum_poll_options
      .map((option: any) => ({
        ...option,
        vote_count: voteCounts[option.id] || 0,
        percentage: totalVotes > 0 ? ((voteCounts[option.id] || 0) / totalVotes) * 100 : 0
      }))
      .sort((a: any, b: any) => a.option_order - b.option_order);

    // Get user's votes if address provided
    let userVotes: string[] = [];
    if (userAddress) {
      const { data: userVoteData } = await supabase
        .from('forum_poll_votes')
        .select('option_id')
        .eq('poll_id', pollId)
        .eq('voter_address', userAddress.toLowerCase());

      userVotes = userVoteData?.map(v => v.option_id) || [];
    }

    // Check if expired
    const hasExpired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false;

    return {
      success: true,
      results: {
        poll,
        options,
        totalVotes,
        userVotes,
        hasExpired
      }
    };
  } catch (error: any) {
    console.error('Error getting poll results:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get poll by thread ID
 */
export async function getPollByThreadId(
  threadId: string
): Promise<{ success: boolean; poll?: Poll; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('forum_polls')
      .select(`
        *,
        forum_poll_options (*)
      `)
      .eq('thread_id', threadId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw error;
    }

    if (!data) {
      return { success: true, poll: undefined };
    }

    return { success: true, poll: data as Poll };
  } catch (error: any) {
    console.error('Error getting poll by thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a poll (moderator only)
 */
export async function deletePoll(
  pollId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete votes first (cascade should handle this, but being explicit)
    await supabase.from('forum_poll_votes').delete().eq('poll_id', pollId);

    // Delete options
    await supabase.from('forum_poll_options').delete().eq('poll_id', pollId);

    // Delete poll
    const { error } = await supabase.from('forum_polls').delete().eq('id', pollId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting poll:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if user has voted on a poll
 */
export async function hasUserVoted(
  pollId: string,
  userAddress: string
): Promise<{ hasVoted: boolean; votes?: string[] }> {
  try {
    const { data, error } = await supabase
      .from('forum_poll_votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('voter_address', userAddress.toLowerCase());

    if (error) throw error;

    return {
      hasVoted: (data?.length || 0) > 0,
      votes: data?.map(v => v.option_id) || []
    };
  } catch (error) {
    console.error('Error checking vote status:', error);
    return { hasVoted: false };
  }
}
