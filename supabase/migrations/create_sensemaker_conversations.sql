-- Create sensemaker_conversations table for logging all chat interactions
-- This helps with analytics, debugging, and potential conversation history features

CREATE TABLE IF NOT EXISTS public.sensemaker_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- User information (optional - can be anonymous)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_address TEXT, -- Wallet address if authenticated

  -- Message details
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- AI routing and metadata
  query_type TEXT CHECK (query_type IN ('spiritdao', 'temporal-naturalism')),
  model TEXT, -- 'gpt-4o-mini' or 'claude-sonnet-4.5'

  -- Context and performance
  context_count INTEGER, -- Number of relevant context chunks retrieved
  response_time_ms INTEGER, -- How long the AI took to respond

  -- Session tracking
  session_id UUID, -- Group related messages in a conversation
  conversation_history JSONB, -- Store previous messages for context

  -- Quality tracking
  relevance_score DECIMAL(3,2), -- Top context relevance score (0-1)
  user_feedback TEXT CHECK (user_feedback IN ('helpful', 'not_helpful', 'report')),
  feedback_note TEXT,

  -- Indexing for analytics
  created_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sensemaker_conversations_created_at
  ON public.sensemaker_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensemaker_conversations_user_id
  ON public.sensemaker_conversations(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sensemaker_conversations_query_type
  ON public.sensemaker_conversations(query_type);

CREATE INDEX IF NOT EXISTS idx_sensemaker_conversations_session_id
  ON public.sensemaker_conversations(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sensemaker_conversations_created_date
  ON public.sensemaker_conversations(created_date DESC);

-- RLS (Row Level Security) policies
ALTER TABLE public.sensemaker_conversations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for anonymous chat)
CREATE POLICY "Anyone can log conversations"
  ON public.sensemaker_conversations
  FOR INSERT
  WITH CHECK (true);

-- Users can read their own conversations
CREATE POLICY "Users can view their own conversations"
  ON public.sensemaker_conversations
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR user_id IS NULL -- Allow viewing anonymous conversations (for analytics)
  );

-- Only admins can update/delete (for moderation)
CREATE POLICY "Only admins can modify conversations"
  ON public.sensemaker_conversations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.wallet_address = (SELECT wallet_address FROM auth.users WHERE id = auth.uid())
      AND profiles.is_admin = true
    )
  );

-- Add comment for documentation
COMMENT ON TABLE public.sensemaker_conversations IS
  'Logs all SensemakerAI chat interactions for analytics, debugging, and potential user history features. Supports both authenticated and anonymous users.';

COMMENT ON COLUMN public.sensemaker_conversations.query_type IS
  'Routing classification: spiritdao (DAO operations) or temporal-naturalism (philosophy)';

COMMENT ON COLUMN public.sensemaker_conversations.model IS
  'Which LLM generated the response: gpt-4o-mini or claude-sonnet-4.5';

COMMENT ON COLUMN public.sensemaker_conversations.session_id IS
  'Groups related messages in a single conversation thread';

COMMENT ON COLUMN public.sensemaker_conversations.relevance_score IS
  'Highest relevance score from Pinecone vector search (0.0-1.0)';
