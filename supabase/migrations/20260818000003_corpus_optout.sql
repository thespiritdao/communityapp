-- 20260818000003_corpus_optout.sql
--
-- Congregant Phase 5: member consent for discourse ingestion.
--
-- A pod may build its agent's mind from the pod's own forum discourse
-- (corpus_includes_forum in community_agent_config). Every member retains an
-- individual right to keep their words out of the agent: this flag excludes
-- all of their forum content from ingestion, and the nightly sync deletes any
-- vectors previously derived from their posts.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS exclude_from_agent_corpus BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.exclude_from_agent_corpus IS
  'Member opt-out from community-agent discourse ingestion (Congregant Phase 5). When true, the member''s forum content is never embedded into any agent corpus and existing derived vectors are removed on the next sync.';
