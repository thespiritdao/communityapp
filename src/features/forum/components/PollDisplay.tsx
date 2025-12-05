// src/features/forum/components/PollDisplay.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  getPollResults,
  votePoll,
  changeVote,
  type PollResults,
} from '../services/PollService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PollDisplayProps {
  pollId: string;
  onVoteComplete?: () => void;
}

export function PollDisplay({ pollId, onVoteComplete }: PollDisplayProps) {
  const { address } = useAccount();
  const [results, setResults] = useState<PollResults | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[PollDisplay] Component mounted/updated with pollId:', pollId);
    loadResults();
  }, [pollId, address]);

  const loadResults = async () => {
    console.log('[PollDisplay] Loading results for poll:', pollId);
    setIsLoading(true);
    try {
      const result = await getPollResults(pollId, address);
      console.log('[PollDisplay] getPollResults returned:', result);
      if (result.success && result.results) {
        console.log('[PollDisplay] Setting results:', {
          question: result.results.poll.question,
          optionsCount: result.results.options.length,
          totalVotes: result.results.totalVotes
        });
        setResults(result.results);
        setSelectedOptions(result.results.userVotes);
      } else {
        console.error('[PollDisplay] Failed to load poll:', result.error);
        setError(result.error || 'Failed to load poll');
      }
    } catch (err) {
      console.error('[PollDisplay] Error loading poll results:', err);
      setError('Failed to load poll');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async () => {
    if (!address || selectedOptions.length === 0) return;

    setIsVoting(true);
    setError(null);
    try {
      const result = results?.userVotes.length
        ? await changeVote(pollId, selectedOptions, address)
        : await votePoll(pollId, selectedOptions, address);

      if (result.success) {
        await loadResults();
        onVoteComplete?.();
      } else {
        setError(result.error || 'Failed to vote');
      }
    } catch (err) {
      console.error('Error voting:', err);
      setError('Failed to vote');
    } finally {
      setIsVoting(false);
    }
  };

  const toggleOption = (optionId: string) => {
    if (results?.hasExpired || !address) return;

    if (results?.poll.allow_multiple) {
      // Multiple choice
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId],
      );
    } else {
      // Single choice
      setSelectedOptions([optionId]);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500">Loading poll...</p>
        </CardContent>
      </Card>
    );
  }

  if (!results) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center" style={{ color: '#8B3A3A' }}>
            {error || 'Poll not found'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasVoted = results.userVotes.length > 0;
  const canVote = !results.hasExpired && address;
  const showResults = hasVoted || results.hasExpired;

  return (
    <Card
      className="border-2"
      style={{
        borderColor: '#2F5D50',
        borderRadius: '12px'
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle
            className="text-lg"
            style={{
              color: '#1F2D2A',
              fontWeight: 600,
              letterSpacing: '0.01em'
            }}
          >
            {results.poll.question}
          </CardTitle>
          <div className="flex gap-2">
            {results.poll.allow_multiple && (
              <Badge
                variant="outline"
                style={{
                  borderColor: '#2F5D50',
                  color: '#2F5D50',
                  borderRadius: '8px'
                }}
              >
                Multiple Choice
              </Badge>
            )}
            {results.hasExpired && (
              <Badge
                variant="destructive"
                style={{
                  backgroundColor: '#8B3A3A',
                  color: '#FFFFFF',
                  borderRadius: '8px'
                }}
              >
                Expired
              </Badge>
            )}
            {results.poll.expires_at && !results.hasExpired && (
              <Badge
                variant="outline"
                style={{
                  borderColor: '#8FAAA1',
                  color: '#1F2D2A',
                  borderRadius: '8px'
                }}
              >
                Expires {new Date(results.poll.expires_at).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Options */}
        {results.options.map((option) => {
          const isSelected = selectedOptions.includes(option.id);
          const hasUserVoted = results.userVotes.includes(option.id);

          return (
            <div
              key={option.id}
              className={`border p-3 transition-all ${
                canVote && !showResults ? 'cursor-pointer' : ''
              }`}
              style={{
                borderRadius: '12px',
                borderWidth: '2px',
                borderColor: canVote && !showResults && isSelected
                  ? '#2F5D50'
                  : '#D8D2C8',
                backgroundColor: canVote && !showResults && isSelected
                  ? '#E8F1EE'
                  : '#FFFFFF',
                ...(canVote && !showResults && !isSelected && {
                  ':hover': {
                    borderColor: '#8FAAA1'
                  }
                })
              }}
              onClick={() => !showResults && toggleOption(option.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {!showResults && canVote && (
                    <input
                      type={results.poll.allow_multiple ? 'checkbox' : 'radio'}
                      checked={isSelected}
                      onChange={() => {}}
                      className="cursor-pointer"
                    />
                  )}
                  <span
                    className="font-medium"
                    style={{
                      color: '#1F2D2A',
                      fontWeight: 500
                    }}
                  >
                    {option.option_text}
                  </span>
                  {hasUserVoted && (
                    <Badge
                      variant="default"
                      className="text-xs"
                      style={{
                        backgroundColor: '#3F7A5A',
                        color: '#FFFFFF',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}
                    >
                      Your vote
                    </Badge>
                  )}
                </div>
                {showResults && (
                  <span className="text-sm font-semibold">
                    {option.vote_count} votes ({option.percentage.toFixed(1)}%)
                  </span>
                )}
              </div>

              {/* Progress bar for results */}
              {showResults && (
                <div
                  className="w-full h-2"
                  style={{
                    backgroundColor: '#E8F1EE',
                    borderRadius: '12px'
                  }}
                >
                  <div
                    className="h-2 transition-all"
                    style={{
                      width: `${option.percentage}%`,
                      backgroundColor: hasUserVoted ? '#2F5D50' : '#8FAAA1',
                      borderRadius: '12px'
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Vote button */}
        {canVote && !hasVoted && (
          <Button
            onClick={handleVote}
            disabled={isVoting || selectedOptions.length === 0}
            className="w-full"
            style={{
              backgroundColor: isVoting || selectedOptions.length === 0 ? '#D8D2C8' : '#2F5D50',
              color: isVoting || selectedOptions.length === 0 ? '#1F2D2A' : '#FFFFFF',
              fontWeight: 600,
              letterSpacing: '0.02em',
              borderRadius: '12px',
              padding: '10px 18px',
              cursor: isVoting || selectedOptions.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isVoting || selectedOptions.length === 0 ? 0.7 : 1
            }}
          >
            {isVoting ? 'Voting...' : 'Submit Vote'}
          </Button>
        )}

        {/* Change vote button */}
        {canVote && hasVoted && (
          <Button
            onClick={handleVote}
            disabled={isVoting || selectedOptions.length === 0}
            variant="outline"
            className="w-full"
            style={{
              backgroundColor: isVoting || selectedOptions.length === 0 ? '#F5F5F5' : '#FFFFFF',
              color: isVoting || selectedOptions.length === 0 ? '#1F2D2A' : '#2F5D50',
              borderColor: isVoting || selectedOptions.length === 0 ? '#D8D2C8' : '#2F5D50',
              borderWidth: '2px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              borderRadius: '12px',
              padding: '10px 18px',
              cursor: isVoting || selectedOptions.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isVoting || selectedOptions.length === 0 ? 0.7 : 1
            }}
          >
            {isVoting ? 'Updating...' : 'Change Vote'}
          </Button>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-center" style={{ color: '#8B3A3A' }}>
            {error}
          </p>
        )}

        {/* Total votes */}
        <p className="text-sm text-gray-500 text-center mt-4">
          Total votes: {results.totalVotes}
        </p>

        {/* Not connected message */}
        {!address && (
          <p className="text-sm text-gray-500 text-center">
            Connect your wallet to vote
          </p>
        )}
      </CardContent>
    </Card>
  );
}
