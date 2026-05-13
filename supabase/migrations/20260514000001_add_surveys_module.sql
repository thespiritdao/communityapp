-- ============================================================
-- Migration: Add surveys add-on module and survey tables
-- Date: 2026-05-14
-- ============================================================

-- 1. Add surveys_enabled + surveys_config to pod_modules
ALTER TABLE pod_modules
ADD COLUMN IF NOT EXISTS surveys_enabled BOOLEAN DEFAULT false;

ALTER TABLE pod_modules
ADD COLUMN IF NOT EXISTS surveys_config JSONB DEFAULT '{}'::jsonb;

UPDATE pod_modules
SET surveys_enabled = false
WHERE surveys_enabled IS NULL;

-- 2. surveys table — one row per survey created by a pod
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  created_by TEXT NOT NULL,
  audience JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_pod_id ON surveys(pod_id);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_surveys_pod_status ON surveys(pod_id, status);

-- 3. survey_questions — ordered questions belonging to a survey
CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('multiple_choice', 'single_select', 'free_text', 'rating_scale')),
  options JSONB DEFAULT '[]'::jsonb,
  rating_max INT DEFAULT 5
    CHECK (rating_max IN (5, 10)),
  sort_order INT NOT NULL DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_id ON survey_questions(survey_id);

-- 4. survey_responses — one row per user per survey
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_wallet TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, respondent_wallet)
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_respondent ON survey_responses(respondent_wallet);

-- 5. survey_answers — one row per question per response
CREATE TABLE IF NOT EXISTS survey_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  answer_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_answers_response_id ON survey_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question_id ON survey_answers(question_id);

-- 6. RLS Policies
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers ENABLE ROW LEVEL SECURITY;

-- surveys: authenticated users can read
CREATE POLICY "surveys_select" ON surveys FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "surveys_insert" ON surveys FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "surveys_update" ON surveys FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "surveys_delete" ON surveys FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- survey_questions
CREATE POLICY "survey_questions_select" ON survey_questions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "survey_questions_insert" ON survey_questions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "survey_questions_update" ON survey_questions FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "survey_questions_delete" ON survey_questions FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- survey_responses
CREATE POLICY "survey_responses_select" ON survey_responses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "survey_responses_insert" ON survey_responses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- survey_answers
CREATE POLICY "survey_answers_select" ON survey_answers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "survey_answers_insert" ON survey_answers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON surveys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_questions TO authenticated;
GRANT SELECT, INSERT ON survey_responses TO authenticated;
GRANT SELECT, INSERT ON survey_answers TO authenticated;
