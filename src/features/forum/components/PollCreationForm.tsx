// src/features/forum/components/PollCreationForm.tsx

'use client';

import { useState } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { createPoll } from '../services/PollService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PollCreationFormProps {
  threadId: string;
  onPollCreated?: (pollId: string) => void;
  onCancel?: () => void;
}

export function PollCreationForm({
  threadId,
  onPollCreated,
  onCancel,
}: PollCreationFormProps) {
  const address = useUserWallet();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>('7');
  const [hasExpiration, setHasExpiration] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    // Validation
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    const validOptions = options.filter((opt) => opt.trim());
    if (validOptions.length < 2) {
      setError('Please provide at least 2 options');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createPoll(
        threadId,
        question.trim(),
        validOptions.map((opt) => opt.trim()),
        address,
        allowMultiple,
        hasExpiration ? parseInt(expiresInDays) : undefined,
      );

      if (result.success && result.pollId) {
        onPollCreated?.(result.pollId);
      } else {
        setError(result.error || 'Failed to create poll');
      }
    } catch (err) {
      console.error('Error creating poll:', err);
      setError('Failed to create poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Poll</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Question */}
          <div>
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              placeholder="What's your question?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Options */}
          <div>
            <Label>Options</Label>
            <div className="space-y-2 mt-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeOption(index)}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                className="mt-2"
              >
                + Add Option
              </Button>
            )}
          </div>

          {/* Allow multiple */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowMultiple"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="cursor-pointer"
            />
            <Label htmlFor="allowMultiple" className="cursor-pointer">
              Allow multiple choices
            </Label>
          </div>

          {/* Expiration */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasExpiration"
              checked={hasExpiration}
              onChange={(e) => setHasExpiration(e.target.checked)}
              className="cursor-pointer"
            />
            <Label htmlFor="hasExpiration" className="cursor-pointer">
              Poll expires in
            </Label>
            {hasExpiration && (
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm" style={{ color: '#8B3A3A' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Creating...' : 'Create Poll'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
