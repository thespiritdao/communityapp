// Pod Survey Manager - Create and manage surveys for your pod
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Play,
  Square,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type {
  Survey,
  SurveyQuestion,
  AudienceOption,
  SurveyQuestionDraft,
  QuestionResult,
} from '@/features/surveys/types';

interface PodSurveyManagerProps {
  podId: string;
  podName: string;
  managementHatId?: string;
  membershipHatId?: string;
  isManager: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#E8E4DC', text: '#5F5A54' },
  active: { bg: '#D4E5DF', text: '#2F5D50' },
  closed: { bg: '#F5E6E6', text: '#8B3A3A' },
};

const QUESTION_TYPES = [
  { value: 'single_select', label: 'Single Select' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'free_text', label: 'Free Text' },
  { value: 'rating_scale', label: 'Rating Scale' },
] as const;

function emptyQuestion(): SurveyQuestionDraft {
  return {
    question_text: '',
    question_type: 'single_select',
    options: ['', ''],
    rating_max: 5,
    is_required: true,
  };
}

export default function PodSurveyManager({
  podId,
  podName,
  isManager,
}: PodSurveyManagerProps) {
  const [surveys, setSurveys] = useState<(Survey & { response_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null);

  // Audience options
  const [audienceOptions, setAudienceOptions] = useState<AudienceOption[]>([]);
  const [loadingAudience, setLoadingAudience] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAudience, setSelectedAudience] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>([emptyQuestion()]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [creating, setCreating] = useState(false);

  // Results
  const [results, setResults] = useState<{ total_responses: number; questions: QuestionResult[] } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    loadSurveys();
  }, [podId]);

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const loadSurveys = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setSurveys(json.surveys || []);
    } catch (error) {
      console.error('Error loading surveys:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAudienceOptions = async () => {
    setLoadingAudience(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/surveys/audience`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const opts = json.options || [];
      setAudienceOptions(opts);

      // Pre-select the first option (the pod itself)
      if (opts.length > 0 && selectedAudience.size === 0) {
        const key = opts[0].type === 'all_users' ? 'all_users' : opts[0].pod_id;
        setSelectedAudience(new Set([key]));
      }
    } catch (error) {
      console.error('Error loading audience options:', error);
    } finally {
      setLoadingAudience(false);
    }
  };

  const handleShowCreate = () => {
    setShowCreate(true);
    loadAudienceOptions();
  };

  const toggleAudience = (key: string) => {
    setSelectedAudience((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Question management
  const addQuestion = () => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, updates: Partial<SurveyQuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const updated = { ...q, ...updates };
        // Reset options when switching to free_text or rating_scale
        if (updates.question_type === 'free_text' || updates.question_type === 'rating_scale') {
          updated.options = [];
        } else if (
          (updates.question_type === 'single_select' || updates.question_type === 'multiple_choice') &&
          updated.options.length < 2
        ) {
          updated.options = ['', ''];
        }
        return updated;
      }),
    );
  };

  const addOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, options: [...q.options, ''] } : q,
      ),
    );
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.filter((_, oi) => oi !== oIndex) }
          : q,
      ),
    );
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, oi) => (oi === oIndex ? value : o)) }
          : q,
      ),
    );
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;
    setQuestions((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  };

  const createSurvey = async () => {
    if (!title.trim()) return alert('Title is required');
    if (selectedAudience.size === 0) return alert('Select at least one audience');
    if (questions.some((q) => !q.question_text.trim())) return alert('All questions need text');

    setCreating(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const audience = Array.from(selectedAudience).map((key) => {
        if (key === 'all_users') return { type: 'all_users' as const };
        return { type: 'pod' as const, pod_id: key };
      });

      const res = await fetch(`/api/pods/${podId}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          audience,
          questions,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to create survey');
      }

      // Reset form
      setTitle('');
      setDescription('');
      setSelectedAudience(new Set());
      setQuestions([emptyQuestion()]);
      setStartsAt('');
      setEndsAt('');
      setShowCreate(false);
      loadSurveys();
    } catch (error: any) {
      console.error('Error creating survey:', error);
      alert(error.message || 'Failed to create survey');
    } finally {
      setCreating(false);
    }
  };

  const updateSurveyStatus = async (surveyId: string, status: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/surveys/${surveyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });

      if (res.ok) loadSurveys();
    } catch (error) {
      console.error('Error updating survey status:', error);
    }
  };

  const deleteSurvey = async (surveyId: string) => {
    if (!confirm('Are you sure you want to delete this survey and all responses?')) return;

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/surveys/${surveyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setExpandedSurvey(null);
        setResults(null);
        loadSurveys();
      }
    } catch (error) {
      console.error('Error deleting survey:', error);
    }
  };

  const loadResults = async (surveyId: string) => {
    setLoadingResults(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/surveys/${surveyId}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setResults(json);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleExpandSurvey = (surveyId: string) => {
    if (expandedSurvey === surveyId) {
      setExpandedSurvey(null);
      setResults(null);
    } else {
      setExpandedSurvey(surveyId);
      loadResults(surveyId);
    }
  };

  if (!isManager) {
    return (
      <Card>
        <CardContent className="p-6 text-center" style={{ color: '#5F5A54' }}>
          <ClipboardCheck className="mx-auto mb-3" size={48} style={{ color: '#6A5F7A' }} />
          <p>Only pod managers can configure surveys.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#6A5F7A' }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardContent className="p-4 w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Surveys</h3>
            <Button
              onClick={showCreate ? () => setShowCreate(false) : handleShowCreate}
              size="sm"
              style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
            >
              {showCreate ? 'Cancel' : 'Create Survey'}
            </Button>
          </div>

          {/* Create Form */}
          {showCreate && (
            <Card className="p-4 mb-4" style={{ backgroundColor: '#F5F2ED' }}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="survey-title">Title *</Label>
                  <Input
                    id="survey-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Community Satisfaction Survey"
                  />
                </div>

                <div>
                  <Label htmlFor="survey-desc">Description</Label>
                  <Textarea
                    id="survey-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of this survey"
                    rows={2}
                  />
                </div>

                {/* Audience Selector */}
                <div>
                  <Label>Audience *</Label>
                  <p className="text-xs mb-2" style={{ color: '#8F8A84' }}>
                    Select who should receive this survey
                  </p>
                  {loadingAudience ? (
                    <div className="text-sm" style={{ color: '#5F5A54' }}>Loading audience options...</div>
                  ) : (
                    <div className="space-y-2">
                      {audienceOptions.map((opt) => {
                        const key = opt.type === 'all_users' ? 'all_users' : opt.pod_id!;
                        const checked = selectedAudience.has(key);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors"
                            style={{
                              backgroundColor: checked ? '#E8F1EE' : '#FFFFFF',
                              border: `1px solid ${checked ? '#2F5D50' : '#E8E4DC'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAudience(key)}
                              className="rounded"
                            />
                            <span className="text-sm font-medium flex-1">{opt.pod_name}</span>
                            <span className="text-xs" style={{ color: '#8F8A84' }}>
                              {opt.member_count} member{opt.member_count !== 1 ? 's' : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Date Range (optional) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="survey-start">Start Date (optional)</Label>
                    <Input
                      id="survey-start"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="survey-end">End Date (optional)</Label>
                    <Input
                      id="survey-end"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                </div>

                {/* Questions Builder */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Questions *</Label>
                    <Button onClick={addQuestion} size="sm" variant="outline" style={{ borderColor: '#2F5D50', color: '#2F5D50' }}>
                      <Plus size={14} className="mr-1" />
                      Add Question
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {questions.map((q, qIndex) => (
                      <Card key={qIndex} className="p-3" style={{ backgroundColor: '#FFFFFF' }}>
                        <div className="space-y-2">
                          {/* Question text — full width */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium flex-shrink-0" style={{ color: '#5F5A54' }}>
                              {qIndex + 1}.
                            </span>
                            <Input
                              value={q.question_text}
                              onChange={(e) => updateQuestion(qIndex, { question_text: e.target.value })}
                              placeholder="Enter your question"
                              className="flex-1"
                            />
                          </div>

                          {/* Controls row — type, rating, required, reorder, delete */}
                          <div className="flex items-center flex-wrap gap-2 ml-6">
                            <select
                              value={q.question_type}
                              onChange={(e) => updateQuestion(qIndex, { question_type: e.target.value as any })}
                              className="p-1.5 text-sm border rounded-md"
                              style={{ borderColor: '#E8E4DC' }}
                            >
                              {QUESTION_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>

                            {q.question_type === 'rating_scale' && (
                              <select
                                value={q.rating_max}
                                onChange={(e) => updateQuestion(qIndex, { rating_max: parseInt(e.target.value) as 5 | 10 })}
                                className="p-1.5 text-sm border rounded-md"
                                style={{ borderColor: '#E8E4DC' }}
                              >
                                <option value={5}>1-5</option>
                                <option value={10}>1-10</option>
                              </select>
                            )}

                            <label className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: '#5F5A54' }}>
                              <input
                                type="checkbox"
                                checked={q.is_required}
                                onChange={(e) => updateQuestion(qIndex, { is_required: e.target.checked })}
                                className="rounded"
                              />
                              Req
                            </label>

                            <div className="flex gap-0.5 ml-auto flex-shrink-0">
                              <Button
                                onClick={() => moveQuestion(qIndex, 'up')}
                                disabled={qIndex === 0}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <ArrowUp size={14} />
                              </Button>
                              <Button
                                onClick={() => moveQuestion(qIndex, 'down')}
                                disabled={qIndex === questions.length - 1}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <ArrowDown size={14} />
                              </Button>
                              <Button
                                onClick={() => removeQuestion(qIndex)}
                                disabled={questions.length <= 1}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                style={{ color: '#8B3A3A' }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>

                          {/* Options editor for MC/SS */}
                          {(q.question_type === 'single_select' || q.question_type === 'multiple_choice') && (
                            <div className="ml-6 space-y-1.5">
                              {q.options.map((opt, oIndex) => (
                                <div key={oIndex} className="flex items-center gap-2">
                                  <span className="text-xs" style={{ color: '#8F8A84' }}>
                                    {q.question_type === 'single_select' ? '○' : '☐'}
                                  </span>
                                  <Input
                                    value={opt}
                                    onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                    placeholder={`Option ${oIndex + 1}`}
                                    className="h-8 text-sm"
                                  />
                                  {q.options.length > 2 && (
                                    <Button
                                      onClick={() => removeOption(qIndex, oIndex)}
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      style={{ color: '#8B3A3A' }}
                                    >
                                      <Trash2 size={12} />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              <Button
                                onClick={() => addOption(qIndex)}
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7"
                                style={{ color: '#2F5D50' }}
                              >
                                <Plus size={12} className="mr-1" />
                                Add Option
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-2">
                  <Button
                    onClick={createSurvey}
                    disabled={creating}
                    className="flex-1"
                    style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                  >
                    {creating ? 'Creating...' : 'Create Survey'}
                  </Button>
                  <Button
                    onClick={() => setShowCreate(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Surveys List */}
          <div className="space-y-2">
            {surveys.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: '#5F5A54' }}>
                No surveys yet. Create one to gather feedback from your community.
              </p>
            ) : (
              surveys.map((survey) => {
                const colors = STATUS_COLORS[survey.status] || STATUS_COLORS.draft;
                const isExpanded = expandedSurvey === survey.id;

                return (
                  <div key={survey.id}>
                    <Card
                      className="p-3 cursor-pointer transition-colors hover:shadow-sm"
                      style={{ backgroundColor: '#FFFFFF' }}
                      onClick={() => handleExpandSurvey(survey.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{survey.title}</p>
                            <Badge
                              className="text-xs flex-shrink-0"
                              style={{ backgroundColor: colors.bg, color: colors.text }}
                            >
                              {survey.status}
                            </Badge>
                          </div>
                          <div className="flex gap-3 mt-1 text-xs" style={{ color: '#8F8A84' }}>
                            <span>{survey.response_count} response{survey.response_count !== 1 ? 's' : ''}</span>
                            <span>{new Date(survey.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={16} style={{ color: '#5F5A54' }} />
                        ) : (
                          <ChevronDown size={16} style={{ color: '#5F5A54' }} />
                        )}
                      </div>
                    </Card>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <Card className="p-4 mt-1" style={{ backgroundColor: '#F5F2ED' }}>
                        <div className="space-y-3">
                          {survey.description && (
                            <p className="text-sm" style={{ color: '#5F5A54' }}>
                              {survey.description}
                            </p>
                          )}

                          {/* Status Controls */}
                          <div className="flex gap-2">
                            {survey.status === 'draft' && (
                              <Button
                                onClick={(e) => { e.stopPropagation(); updateSurveyStatus(survey.id, 'active'); }}
                                size="sm"
                                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                              >
                                <Play size={14} className="mr-1" />
                                Activate
                              </Button>
                            )}
                            {survey.status === 'active' && (
                              <Button
                                onClick={(e) => { e.stopPropagation(); updateSurveyStatus(survey.id, 'closed'); }}
                                size="sm"
                                style={{ backgroundColor: '#C6933F', color: '#FFFFFF' }}
                              >
                                <Square size={14} className="mr-1" />
                                Close
                              </Button>
                            )}
                            <Button
                              onClick={(e) => { e.stopPropagation(); deleteSurvey(survey.id); }}
                              size="sm"
                              variant="outline"
                              style={{ borderColor: '#8B3A3A', color: '#8B3A3A' }}
                            >
                              <Trash2 size={14} className="mr-1" />
                              Delete
                            </Button>
                          </div>

                          {/* Results */}
                          {loadingResults ? (
                            <div className="text-sm" style={{ color: '#5F5A54' }}>Loading results...</div>
                          ) : results ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <BarChart3 size={16} style={{ color: '#6A5F7A' }} />
                                <span className="text-sm font-medium">
                                  {results.total_responses} total response{results.total_responses !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {results.questions.map((qr: any) => (
                                <Card key={qr.question_id} className="p-3" style={{ backgroundColor: '#FFFFFF' }}>
                                  <p className="text-sm font-medium mb-2">{qr.question_text}</p>

                                  {qr.summary.type === 'option_counts' && (
                                    <div className="space-y-1.5">
                                      {Object.entries(qr.summary.option_counts).map(([option, count]) => {
                                        const total =
                                          qr.summary.answered_count || results.total_responses || 1;
                                        const pct = Math.round(((count as number) / total) * 100);
                                        return (
                                          <div key={option}>
                                            <div className="flex justify-between text-xs mb-0.5">
                                              <span>{option}</span>
                                              <span style={{ color: '#5F5A54' }}>{count as number} ({pct}%)</span>
                                            </div>
                                            <div className="h-2 rounded-full" style={{ backgroundColor: '#E8E4DC' }}>
                                              <div
                                                className="h-2 rounded-full transition-all"
                                                style={{ width: `${pct}%`, backgroundColor: '#6A5F7A' }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {qr.summary.type === 'rating' && (
                                    <div>
                                      <p className="text-2xl font-semibold" style={{ color: '#2F5D50' }}>
                                        {qr.summary.average}
                                        <span className="text-sm font-normal" style={{ color: '#8F8A84' }}>
                                          {' '}/ {qr.rating_max || 5}
                                        </span>
                                      </p>
                                      <div className="flex gap-1 mt-1">
                                        {Array.from({ length: qr.rating_max || 5 }, (_, i) => i + 1).map((val) => (
                                          <div key={val} className="text-center flex-1">
                                            <div
                                              className="h-6 rounded-sm"
                                              style={{
                                                backgroundColor: '#6A5F7A',
                                                opacity: (qr.summary.distribution[val] || 0) > 0 ? 0.3 + (0.7 * (qr.summary.distribution[val] || 0)) / (qr.summary.answered_count || results.total_responses || 1) : 0.1,
                                              }}
                                            />
                                            <span className="text-[10px]" style={{ color: '#8F8A84' }}>{val}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {qr.summary.type === 'free_text' && (
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                      {qr.summary.responses.length === 0 ? (
                                        <p className="text-xs" style={{ color: '#8F8A84' }}>No responses yet</p>
                                      ) : (
                                        qr.summary.responses.map((text: string, i: number) => (
                                          <p key={i} className="text-xs p-2 rounded" style={{ backgroundColor: '#F5F2ED' }}>
                                            {text}
                                          </p>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </Card>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </Card>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
