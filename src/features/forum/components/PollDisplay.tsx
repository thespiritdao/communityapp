// src/features/forum/components/PollDisplay.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  getPollResults,
  votePoll,
  changeVote,
  type PollResults
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
    loadResults();
  }, [pollId, address]);

  const loadResults = async () => {
    setIsLoading(true);
    try {
      const result = await getPollResults(pollId, address);
      if (result.success && result.results) {
        setResults(result.results);
        setSelectedOptions(result.results.userVotes);
      } else {
        setError(result.error || 'Failed to load poll');
      }
    } catch (err) {
      console.error('Error loading poll results:', err);
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
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
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
          <p className="text-center" style={{ color: '#8B3A3A' }}>{error || 'Poll not found'}</p>
        </CardContent>
      </Card>
    );
  }

  const hasVoted = results.userVotes.length > 0;
  const canVote = !results.hasExpired && address;
  const showResults = hasVoted || results.hasExpired;

  return (
    <Card className="border-2" style={{ borderColor: '#B8D9CA' }}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{results.poll.question}</CardTitle>
          <div className="flex gap-2">
            {results.poll.allow_multiple && (
              <Badge variant="outline">Multiple Choice</Badge>
            )}
            {results.hasExpired && (
              <Badge variant="destructive">Expired</Badge>
            )}
            {results.poll.expires_at && !results.hasExpired && (
              <Badge variant="outline">
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
              className={`border rounded-lg p-3 cursor-pointer transition-all ${
                canVote && !showResults
                  ? isSelected
                    ? ''
                    : 'border-gray-300 hover:border-gray-400'
                  : 'border-gray-200'
              }`}
              style={canVote && !showResults && isSelected ? { borderColor: '#2F5D50', backgroundColor: '#E8F1EE' } : undefined}
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
                  <span className="font-medium">{option.option_text}</span>
                  {hasUserVoted && (
                    <Badge variant="default" className="text-xs">
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
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${option.percentage}%`, backgroundColor: '#2F5D50' }}
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
          >
            {isVoting ? 'Updating...' : 'Change Vote'}
          </Button>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-center" style={{ color: '#8B3A3A' }}>{error}</p>
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
