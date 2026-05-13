'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import type { Survey, SurveyQuestion, SurveyAnswer } from '../types';

interface SurveyResponseFormProps {
  surveyId: string;
  podId: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function SurveyResponseForm({
  surveyId,
  podId,
  onComplete,
  onCancel,
}: SurveyResponseFormProps) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [hasResponded, setHasResponded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSurvey();
  }, [surveyId, podId]);

  async function loadSurvey() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/pods/${podId}/surveys/${surveyId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError('Failed to load survey');
        return;
      }

      const data = await res.json();
      setSurvey(data.survey);
      setQuestions(data.questions || []);
      setHasResponded(data.has_responded);
    } catch {
      setError('Failed to load survey');
    } finally {
      setLoading(false);
    }
  }

  function setAnswer(questionId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiChoice(questionId: string, option: string) {
    setAnswers((prev) => {
      const current: string[] = prev[questionId] || [];
      if (current.includes(option)) {
        return { ...prev, [questionId]: current.filter((o: string) => o !== option) };
      }
      return { ...prev, [questionId]: [...current, option] };
    });
  }

  async function handleSubmit() {
    if (!survey) return;

    // Validate required questions
    for (const q of questions) {
      if (q.is_required) {
        const val = answers[q.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          setError(`Please answer: "${q.question_text}"`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const answerPayload: SurveyAnswer[] = Object.entries(answers).map(
        ([question_id, answer_value]) => ({ question_id, answer_value }),
      );

      const res = await fetch(`/api/pods/${podId}/surveys/${surveyId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ answers: answerPayload }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit response');
        return;
      }

      setSubmitted(true);
      onComplete?.();
    } catch {
      setError('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#2F5D50' }} />
      </div>
    );
  }

  if (!survey) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500">
          Survey not found
        </CardContent>
      </Card>
    );
  }

  if (hasResponded || submitted) {
    return (
      <Card style={{ borderColor: '#B8D9CA' }}>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: '#2F5D50' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: '#1F2D2A' }}>
            {submitted ? 'Response Submitted' : 'Already Responded'}
          </h3>
          <p className="text-sm text-gray-600">
            {submitted
              ? 'Thank you for completing this survey.'
              : 'You have already submitted your response to this survey.'}
          </p>
          {onCancel && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={onCancel}
              style={{ borderColor: '#2F5D50', color: '#2F5D50' }}
            >
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Survey Header */}
      <Card style={{ borderColor: '#B8D9CA' }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-5 h-5" style={{ color: '#2F5D50' }} />
            <h2 className="text-xl font-semibold" style={{ color: '#1F2D2A' }}>
              {survey.title}
            </h2>
          </div>
          {survey.description && (
            <p className="text-sm text-gray-600">{survey.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: '#2F5D50', color: '#2F5D50' }}
            >
              {questions.length} question{questions.length !== 1 ? 's' : ''}
            </Badge>
            {questions.some((q) => q.is_required) && (
              <span className="text-xs text-gray-500">* Required</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {questions.map((question, idx) => (
        <Card key={question.id} style={{ borderColor: '#E0E0E0' }}>
          <CardContent className="p-5">
            <div className="mb-3">
              <span className="text-sm font-medium" style={{ color: '#1F2D2A' }}>
                {idx + 1}. {question.question_text}
                {question.is_required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </span>
            </div>

            {/* Multiple Choice — checkboxes */}
            {question.question_type === 'multiple_choice' && (
              <div className="space-y-2">
                {(question.options || []).map((option) => {
                  const selected = (answers[question.id] || []).includes(option);
                  return (
                    <label
                      key={option}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors"
                      style={{
                        backgroundColor: selected ? '#E8F1EE' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMultiChoice(question.id, option)}
                        className="accent-[#2F5D50]"
                      />
                      <span className="text-sm">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Single Select — radio buttons */}
            {question.question_type === 'single_select' && (
              <div className="space-y-2">
                {(question.options || []).map((option) => {
                  const selected = answers[question.id] === option;
                  return (
                    <label
                      key={option}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors"
                      style={{
                        backgroundColor: selected ? '#E8F1EE' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={selected}
                        onChange={() => setAnswer(question.id, option)}
                        className="accent-[#2F5D50]"
                      />
                      <span className="text-sm">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Free Text — textarea */}
            {question.question_type === 'free_text' && (
              <Textarea
                value={answers[question.id] || ''}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                placeholder="Type your answer..."
                className="min-h-[80px]"
                style={{ borderColor: '#B8D9CA' }}
              />
            )}

            {/* Rating Scale — numbered buttons */}
            {question.question_type === 'rating_scale' && (
              <div className="flex flex-wrap gap-2 mt-1">
                {Array.from({ length: question.rating_max }, (_, i) => i + 1).map(
                  (num) => {
                    const selected = answers[question.id] === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setAnswer(question.id, num)}
                        className="w-10 h-10 rounded-lg border text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: selected ? '#2F5D50' : 'white',
                          color: selected ? 'white' : '#1F2D2A',
                          borderColor: selected ? '#2F5D50' : '#B8D9CA',
                        }}
                      >
                        {num}
                      </button>
                    );
                  },
                )}
                <div className="w-full flex justify-between text-xs text-gray-400 mt-1 px-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Error */}
      {error && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            style={{ borderColor: '#2F5D50', color: '#2F5D50' }}
          >
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ backgroundColor: '#2F5D50', color: 'white' }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Response'
          )}
        </Button>
      </div>
    </div>
  );
}
