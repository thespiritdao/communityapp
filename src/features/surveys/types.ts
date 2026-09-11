export interface Survey {
  id: string;
  pod_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'closed';
  created_by: string;
  audience: AudienceTarget[];
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceTarget {
  type: 'pod' | 'all_users';
  pod_id?: string;
}

export interface AudienceOption {
  type: 'pod' | 'all_users';
  pod_id?: string;
  pod_name?: string;
  member_count: number;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'single_select' | 'free_text' | 'rating_scale';
  options: string[];
  rating_max: 5 | 10;
  sort_order: number;
  is_required: boolean;
  created_at: string;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  respondent_wallet: string;
  submitted_at: string;
}

export interface SurveyAnswer {
  question_id: string;
  answer_value: string | number | string[];
}

export interface QuestionResult {
  question_id: string;
  question_text: string;
  question_type: SurveyQuestion['question_type'];
  summary: OptionCountSummary | FreeTextSummary | RatingSummary;
}

export interface OptionCountSummary {
  type: 'option_counts';
  option_counts: Record<string, number>;
  /** People who answered this question; the denominator for each option's share. */
  answered_count: number;
}

export interface FreeTextSummary {
  type: 'free_text';
  responses: string[];
  answered_count: number;
}

export interface RatingSummary {
  type: 'rating';
  average: number;
  distribution: Record<number, number>;
  answered_count: number;
}

// Form types used in the survey builder
export interface SurveyQuestionDraft {
  question_text: string;
  question_type: SurveyQuestion['question_type'];
  options: string[];
  rating_max: 5 | 10;
  is_required: boolean;
}

export interface CreateSurveyPayload {
  title: string;
  description?: string;
  audience: AudienceTarget[];
  questions: SurveyQuestionDraft[];
  starts_at?: string;
  ends_at?: string;
}
