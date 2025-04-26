import { supabase } from 'src/utils/supabaseClient';

export default async function createPost(req, res) {
  try {
    console.log('✅ createPost API called');

    // Log request body
    console.log('📩 Received request body:', req.body);

    const { data: { session } } = await supabase.auth.getSession();
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
      return res.status(400).json({ error: 'User profile not found or missing wallet address' });
    }

    console.log('✅ User profile retrieved:', profile);

    // Get threadId, content, and required_token from request
    let { threadId, content, required_token } = req.body;
    if (!threadId || !content) {
      console.error('❌ Missing threadId or content');
      return res.status(400).json({ error: 'Missing threadId or content' });
    }

    console.log(`📌 Received threadId: ${threadId}, content length: ${content.length}`);
    console.log(`🔍 Received required_token from frontend: ${required_token}`);

    // If required_token is missing, fetch it from the thread
    if (!required_token) {
      console.log('🔄 Fetching required_token from forum_threads...');
      const { data: threadData, error: threadError } = await supabase
        .from('forum_threads')
        .select('required_token')
        .eq('id', threadId)
        .single();

      if (threadError) {
        console.error('❌ Error fetching required_token from forum_threads:', threadError);
        return res.status(500).json({ error: 'Failed to retrieve thread token requirement' });
      }

      required_token = threadData?.required_token || null;
      console.log(`✅ Inherited required_token from thread: ${required_token}`);
    }

    // Insert post into the database
    console.log('📤 Inserting post into forum_posts...');
    const { error: insertError } = await supabase
      .from('forum_posts')
      .insert({
        thread_id: threadId,
        content,
        author_wallet: profile.wallet_address,
        required_token: required_token,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return res.status(409).json({ error: insertError.message });
    }

    console.log('✅ Post successfully inserted with required_token:', required_token);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('❌ createPost error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
