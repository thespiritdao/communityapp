import { getCurrentSession } from '@/features/identity/utils/serverAuth';
import { supabase } from '@/utils/supabaseClient';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function createPost(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    console.log('✅ createPost API called');

    // Log request body
    console.log('📩 Received request body:', req.body);

    const session = await getCurrentSession();
    if (!session?.user?.id) {
      console.error('❌ Unauthorized request - No session found');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('✅ User session found:', session.user.id);

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('wallet_address, first_name, last_name')
      .eq('user_id', session.user.id)
      .single();

    if (profileError || !profile?.wallet_address) {
      console.error('❌ User profile error or missing wallet:', profileError);
      return res
        .status(400)
        .json({ error: 'User profile not found or missing wallet address' });
    }

    console.log('✅ User profile retrieved:', profile);

    // Get threadId, content, and required_token from request
    let { threadId, content, required_token } = req.body;
    if (!threadId || !content) {
      console.error('❌ Missing threadId or content');
      return res.status(400).json({ error: 'Missing threadId or content' });
    }

    console.log(
      `📌 Received threadId: ${threadId}, content length: ${content.length}`,
    );
    console.log(`🔍 Received required_token from frontend: ${required_token}`);

    // Fetch thread details including category -> pod_id chain
    const { data: threadData, error: threadError } = await supabase
      .from('forum_threads')
      .select('required_token, category_id')
      .eq('id', threadId)
      .single();

    if (threadError) {
      console.error(
        '❌ Error fetching thread data:',
        threadError,
      );
      return res
        .status(500)
        .json({ error: 'Failed to retrieve thread data' });
    }

    // Inherit required_token from thread if not provided
    if (!required_token) {
      required_token = threadData?.required_token || null;
      console.log(`✅ Inherited required_token from thread: ${required_token}`);
    }

    // Verify pod membership if thread belongs to a pod-gated category
    if (threadData?.category_id) {
      const { data: category } = await supabase
        .from('forum_categories')
        .select('pod_id')
        .eq('id', threadData.category_id)
        .single();

      if (category?.pod_id) {
        const { data: membership } = await supabase
          .from('active_pod_members')
          .select('id')
          .eq('pod_id', category.pod_id)
          .eq('wallet', profile.wallet_address.toLowerCase())
          .eq('is_active', true)
          .maybeSingle();

        if (!membership) {
          console.error('❌ Pod membership check failed for post creation');
          return res
            .status(403)
            .json({ error: 'Access denied: You are not a member of this pod.' });
        }
        console.log('✅ Pod membership verified for post creation');
      }
    }

    // Insert post into the database
    console.log('📤 Inserting post into forum_posts...');
    const { error: insertError } = await supabase.from('forum_posts').insert({
      thread_id: threadId,
      content,
      author_address: profile.wallet_address,
      required_token: required_token,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return res.status(409).json({ error: insertError.message });
    }

    console.log(
      '✅ Post successfully inserted with required_token:',
      required_token,
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ createPost error:', err);
    return res
      .status(500)
      .json({
        error: err instanceof Error ? err.message : 'Unknown error',
      });
  }
}
