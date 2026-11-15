// src/features/forum/components/ThreadSummary.tsx

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ThreadSummaryProps {
  threadId: string;
  threadTitle: string;
  threadContent?: string;
}

interface Summary {
  id: string;
  thread_id: string;
  summary_text: string;
  key_points: string[];
  sentiment?: string;
  generated_by: string;
  generated_at: string;
}

export function ThreadSummary({
  threadId,
  threadTitle,
  threadContent,
}: ThreadSummaryProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, [threadId]);

  const loadSummary = async () => {
    setIsLoading(true);
    try {
      // Only select specific fields to avoid schema cache issues
      // Note: 'sentiment' field may not exist yet - will be NULL until migration is complete
      const { data, error } = await supabase
        .from('forum_thread_summaries')
        .select(
          'id, thread_id, summary_text, key_points, generated_by, generated_at',
        )
        .eq('thread_id', threadId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setSummary(data as Summary);
    } catch (err) {
      console.error('Error loading summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSummary = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // The server reads the thread itself, as the signed-in member.
      const sensemakerResponse = await fetch('/api/sensemaker/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await ensureAuthHeaders()) },
        body: JSON.stringify({ threadId }),
      });

      if (!sensemakerResponse.ok) {
        // Extract the actual error message from the API response
        const errorData = await sensemakerResponse
          .json()
          .catch(() => ({ error: 'Failed to generate summary' }));
        throw new Error(errorData.error || 'Failed to generate summary');
      }

      const { summary: savedSummary } = await sensemakerResponse.json();

      // Summary is already saved to database by the API
      setSummary(savedSummary as Summary);
    } catch (err: any) {
      console.error('Error generating summary:', err);
      setError(err.message || 'Failed to generate summary');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return null; // Don't show loading state
  }

  if (!summary) {
    return (
      <Card style={{ backgroundColor: '#EDEAF0', borderColor: '#D1CAD9' }}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <img
              src="/images/sensemakeraikey.png"
              alt="Sensemaker AI"
              style={{ width: '32px', height: '32px', objectFit: 'contain' }}
            />
            <span className="text-base font-semibold text-gray-700">
              SensemakerAI
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={generateSummary}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Summarize'}
            </Button>
          </div>
          {error && (
            <p className="text-sm mt-2" style={{ color: '#8B3A3A' }}>
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={{ backgroundColor: '#EDEAF0', borderColor: '#D1CAD9' }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/images/sensemakeraikey.png"
              alt="Sensemaker AI"
              style={{ width: '32px', height: '32px', objectFit: 'contain' }}
            />
            <CardTitle className="text-lg">Sensemaker Summary</CardTitle>
          </div>
          {summary.sentiment && summary.sentiment !== 'neutral' && (
            <Badge variant="outline">{summary.sentiment}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary text */}
        <p className="text-sm text-gray-700">{summary.summary_text}</p>

        {/* Key points */}
        {summary.key_points && summary.key_points.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">Key Points:</p>
            <ul className="list-disc list-inside space-y-1">
              {summary.key_points.map((point, index) => (
                <li key={index} className="text-sm text-gray-700">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-gray-500">
            Generated {new Date(summary.generated_at).toLocaleDateString()}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={generateSummary}
            disabled={isGenerating}
          >
            {isGenerating ? 'Updating...' : 'Regenerate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
