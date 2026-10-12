-- Scope chat_messages reads (privacy review 2026-10-09, P0-2).
--
-- Permissive SELECT policies are OR'd. Three of them let any signed-in
-- session read every row, DMs included:
--   "Authenticated users can view chat messages"  USING (true)
--   "Enable realtime for authenticated users"     USING (auth.uid() IS NOT NULL)
--   "select_messages"                             USING (required_token IS NULL OR ...)  -- DMs have no token
-- and "Users can view pod chat messages" exposed every pod's group chat to
-- anyone signed in. Signing in needs only a Coinbase email login.
--
-- After this migration:
--   DMs          → sender or receiver only ("Users can view their own direct messages", kept)
--   pod groups   → active members / leads of that pod
--   pod-less groups (General) → any signed-in member
--   community_agent → group messages + DMs it is a party to
-- Realtime respects RLS, so subscriptions keep working for permitted rows.

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can view chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Enable realtime for authenticated users" ON public.chat_messages;
DROP POLICY IF EXISTS "select_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view pod chat messages" ON public.chat_messages;

CREATE POLICY "Members can view group chat messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    is_direct_message = false
    AND chat_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_groups g
      WHERE g.id::text = chat_messages.chat_group_id
        AND g.is_active = true
        AND (g.pod_id IS NULL OR public.is_pod_member_current_user(g.pod_id))
    )
  );

DROP POLICY IF EXISTS "agent_select_chat_messages" ON public.chat_messages;
CREATE POLICY "agent_select_chat_messages"
  ON public.chat_messages
  FOR SELECT
  TO community_agent
  USING (
    is_direct_message = false
    OR lower(sender_wallet_id) = public.jwt_agent_wallet()
    OR lower(receiver_wallet_id) = public.jwt_agent_wallet()
  );

COMMIT;
