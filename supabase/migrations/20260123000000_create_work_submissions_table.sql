-- Create work_submissions table for tracking completed work submissions
-- This enables the full work submission and review workflow

CREATE TABLE IF NOT EXISTS work_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,

  -- Submitter
  submitter_address TEXT NOT NULL,

  -- Submission content
  submission_title TEXT NOT NULL,
  submission_description TEXT NOT NULL,
  deliverable_urls JSONB DEFAULT '[]'::jsonb, -- Array of {label: string, url: string}
  attachment_urls TEXT[] DEFAULT '{}', -- Array of URL strings
  completed_deliverables TEXT[] DEFAULT '{}', -- Array of deliverable descriptions

  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
  reviewer_address TEXT,
  review_comments TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Revision tracking
  revision_number INTEGER NOT NULL DEFAULT 1,
  previous_submission_id UUID REFERENCES work_submissions(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_work_submissions_bounty_id ON work_submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_work_submissions_bid_id ON work_submissions(bid_id);
CREATE INDEX IF NOT EXISTS idx_work_submissions_submitter ON work_submissions(submitter_address);
CREATE INDEX IF NOT EXISTS idx_work_submissions_status ON work_submissions(status);
CREATE INDEX IF NOT EXISTS idx_work_submissions_created_at ON work_submissions(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_work_submissions_bid_status ON work_submissions(bid_id, status);

-- Enable Row Level Security
ALTER TABLE work_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. Anyone can view work submissions for bounties they have access to
CREATE POLICY "Users can view work submissions for accessible bounties"
  ON work_submissions
  FOR SELECT
  USING (
    -- Allow if user is the submitter
    submitter_address = LOWER(COALESCE(
      current_setting('request.jwt.claims', true)::json->>'evmAddress',
      current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
      ''
    ))
    OR
    -- Allow if user is the bounty creator (can see all submissions for their bounties)
    EXISTS (
      SELECT 1 FROM bounties b
      WHERE b.id = work_submissions.bounty_id
      AND b.creator_address = LOWER(COALESCE(
        current_setting('request.jwt.claims', true)::json->>'evmAddress',
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
        ''
      ))
    )
    OR
    -- Allow if user is the reviewer
    reviewer_address = LOWER(COALESCE(
      current_setting('request.jwt.claims', true)::json->>'evmAddress',
      current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
      ''
    ))
    OR
    -- Allow if user is a pod admin/member with permissions
    EXISTS (
      SELECT 1 FROM bounties b
      JOIN pod_role_permissions prp ON prp.pod_id = b.pod_id
      JOIN active_pod_members apm ON apm.pod_id = b.pod_id
        AND apm.role_id = prp.role_id
      WHERE b.id = work_submissions.bounty_id
      AND apm.address = LOWER(COALESCE(
        current_setting('request.jwt.claims', true)::json->>'evmAddress',
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
        ''
      ))
      AND prp.can_manage_bounties = true
    )
  );

-- 2. Only the bidder can create work submissions for their approved bid
CREATE POLICY "Bidders can create work submissions for their approved bids"
  ON work_submissions
  FOR INSERT
  WITH CHECK (
    -- Must be the bidder who submitted the bid
    submitter_address = LOWER(COALESCE(
      current_setting('request.jwt.claims', true)::json->>'evmAddress',
      current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
      ''
    ))
    AND
    -- The bid must be approved
    EXISTS (
      SELECT 1 FROM bids
      WHERE bids.id = work_submissions.bid_id
      AND bids.status = 'approved'
      AND bids.bidder_address = work_submissions.submitter_address
    )
  );

-- 3. Submitters can update their own pending submissions (for revisions)
CREATE POLICY "Submitters can update their own pending submissions"
  ON work_submissions
  FOR UPDATE
  USING (
    submitter_address = LOWER(COALESCE(
      current_setting('request.jwt.claims', true)::json->>'evmAddress',
      current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
      ''
    ))
    AND status IN ('pending', 'revision_requested')
  );

-- 4. Bounty creators and authorized reviewers can update submissions (for review)
CREATE POLICY "Authorized users can review work submissions"
  ON work_submissions
  FOR UPDATE
  USING (
    -- Bounty creator can review
    EXISTS (
      SELECT 1 FROM bounties b
      WHERE b.id = work_submissions.bounty_id
      AND b.creator_address = LOWER(COALESCE(
        current_setting('request.jwt.claims', true)::json->>'evmAddress',
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
        ''
      ))
    )
    OR
    -- Assigned reviewer can review
    reviewer_address = LOWER(COALESCE(
      current_setting('request.jwt.claims', true)::json->>'evmAddress',
      current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
      ''
    ))
    OR
    -- Pod admins with bounty management permissions can review
    EXISTS (
      SELECT 1 FROM bounties b
      JOIN pod_role_permissions prp ON prp.pod_id = b.pod_id
      JOIN active_pod_members apm ON apm.pod_id = b.pod_id
        AND apm.role_id = prp.role_id
      WHERE b.id = work_submissions.bounty_id
      AND apm.address = LOWER(COALESCE(
        current_setting('request.jwt.claims', true)::json->>'evmAddress',
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'evmAddress',
        ''
      ))
      AND prp.can_manage_bounties = true
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_work_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on every update
CREATE TRIGGER work_submissions_updated_at
  BEFORE UPDATE ON work_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_work_submissions_updated_at();

-- Add helpful comment
COMMENT ON TABLE work_submissions IS 'Stores work submissions for bounties. Enables workers to submit completed work and allows reviewers to approve/reject submissions.';
