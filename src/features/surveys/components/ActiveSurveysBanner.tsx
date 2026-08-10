'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { ClipboardCheck, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SurveyResponseForm from './SurveyResponseForm';
import type { Survey } from '../types';

interface ActiveSurveysBannerProps {
  podId: string;
}

export default function ActiveSurveysBanner({ podId }: ActiveSurveysBannerProps) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);

  useEffect(() => {
    loadActiveSurveys();
  }, [podId]);

  async function loadActiveSurveys() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/pods/${podId}/surveys`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) return;

      const data = await res.json();
      // Filter to active surveys the user hasn't responded to
      const active = (data.surveys || []).filter(
        (s: any) => s.status === 'active' && !s.has_responded,
      );
      setSurveys(active);
    } catch {
      // Silently fail — banner is non-critical
    } finally {
      setLoading(false);
    }
  }

  function handleSurveyComplete() {
    setActiveSurveyId(null);
    // Remove the completed survey from the list
    setSurveys((prev) => prev.filter((s) => s.id !== activeSurveyId));
  }

  if (loading || surveys.length === 0) return null;

  // If user is taking a survey, show the response form
  if (activeSurveyId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#1F2D2A' }}>
            <ClipboardCheck className="w-5 h-5" style={{ color: '#2F5D50' }} />
            Survey
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveSurveyId(null)}
            className="text-gray-500"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <SurveyResponseForm
          surveyId={activeSurveyId}
          podId={podId}
          onComplete={handleSurveyComplete}
          onCancel={() => setActiveSurveyId(null)}
        />
      </div>
    );
  }

  // Single survey — show inline with direct respond button
  if (surveys.length === 1) {
    const survey = surveys[0];
    return (
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
      >
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-5 h-5 flex-shrink-0" style={{ color: '#2F5D50' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: '#1F2D2A' }}>
              {survey.title}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setActiveSurveyId(survey.id)}
            style={{ backgroundColor: '#2F5D50', color: 'white' }}
            className="flex-shrink-0"
          >
            Respond
          </Button>
        </div>
      </div>
    );
  }

  // Multiple surveys — collapsible list
  return (
    <div
      className="rounded-lg border p-3"
      style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
    >
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <ClipboardCheck className="w-5 h-5 flex-shrink-0" style={{ color: '#2F5D50' }} />
        <span className="font-medium text-sm flex-1" style={{ color: '#1F2D2A' }}>
          {surveys.length} surveys available
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#2F5D50' }} />
        ) : (
          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#2F5D50' }} />
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="flex items-center gap-3 p-3 rounded-md bg-white border"
              style={{ borderColor: '#E0E0E0' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#1F2D2A' }}>
                  {survey.title}
                </p>
                {survey.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {survey.description}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => setActiveSurveyId(survey.id)}
                style={{ backgroundColor: '#2F5D50', color: 'white' }}
                className="flex-shrink-0"
              >
                Respond
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
