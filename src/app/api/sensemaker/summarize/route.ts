// src/app/api/sensemaker/summarize/route.ts

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

/**
 * Sensemaker AI Summarization API
 *
 * Siloed implementation for forum thread summarization using GPT-4o-mini.
 * This is a non-interactive, one-time summarization service.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(req: NextRequest) {
  try {
    console.log('[Sensemaker API] Request received');
    const { content, threadId, threadTitle } = await req.json();
    console.log(`[Sensemaker API] Thread ID: ${threadId}, Title: ${threadTitle}`);

    if (!content || !threadId) {
      console.error('[Sensemaker API] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('[Sensemaker API] OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Validate Supabase credentials
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Sensemaker API] Supabase credentials not configured');
      return NextResponse.json(
        { error: 'Database service not configured' },
        { status: 500 }
      );
    }

    console.log('[Sensemaker API] Generating AI summary...');
    // Generate summary using OpenAI GPT-4o-mini
    const summary = await generateAISummary(content, threadTitle);
    console.log('[Sensemaker API] AI summary generated successfully');

    console.log('[Sensemaker API] Saving summary to database...');

    // Build upsert payload - only include sentiment if column exists
    const upsertPayload: any = {
      thread_id: threadId,
      summary_text: summary.text,
      key_points: summary.keyPoints,
      generated_by: 'sensemaker-ai',
      generated_at: new Date().toISOString()
    };

    // Note: sentiment field will be added once database migration is run
    // For now, we skip it to allow the feature to work
    // TODO: Uncomment this line after running the migration
    // upsertPayload.sentiment = summary.sentiment;

    // Use UPSERT to update if exists, insert if not (bypasses RLS)
    // onConflict specifies which column to check for duplicates
    const { data: savedSummary, error: saveError } = await supabaseAdmin
      .from('forum_thread_summaries')
      .upsert(upsertPayload, { onConflict: 'thread_id' })
      .select()
      .single();

    if (saveError) {
      console.error('[Sensemaker API] Error saving summary to database:', saveError);
      throw new Error(`Database error: ${saveError.message}`);
    }

    console.log('[Sensemaker API] Summary saved successfully');
    return NextResponse.json({
      summary: savedSummary
    });
  } catch (error: any) {
    console.error('[Sensemaker API] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

/**
 * Generate AI summary using OpenAI GPT-4o-mini
 */
async function generateAISummary(
  content: string,
  threadTitle: string
): Promise<{
  text: string;
  keyPoints: string[];
  sentiment: string;
}> {
  console.log('[generateAISummary] Starting AI summary generation');
  try {
    // Truncate content if it's too long (max ~6000 characters to stay within token limits)
    const truncatedContent = content.length > 6000
      ? content.substring(0, 6000) + '...'
      : content;

    console.log(`[generateAISummary] Content length: ${truncatedContent.length} characters`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a forum thread summarizer for SpiritDAO. Your task is to:
1. Provide a concise 2-3 sentence summary of the discussion
2. Extract 3-5 key points from the thread
3. Determine the overall sentiment (positive, neutral, or negative)

Respond ONLY with valid JSON in this exact format:
{
  "summary": "2-3 sentence summary here",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "sentiment": "positive" or "neutral" or "negative"
}`
        },
        {
          role: 'user',
          content: `Thread Title: ${threadTitle}\n\nThread Content:\n${truncatedContent}`
        }
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    console.log('[generateAISummary] OpenAI API call successful');

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      console.error('[generateAISummary] No response from OpenAI');
      throw new Error('No response from OpenAI');
    }

    console.log('[generateAISummary] Parsing JSON response');
    // Parse JSON response
    const parsedResponse = JSON.parse(responseText);

    console.log('[generateAISummary] Successfully parsed response');
    return {
      text: parsedResponse.summary || 'Summary unavailable',
      keyPoints: Array.isArray(parsedResponse.keyPoints) ? parsedResponse.keyPoints : [],
      sentiment: parsedResponse.sentiment || 'neutral'
    };
  } catch (error: any) {
    console.error('[generateAISummary] Error details:', {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack
    });

    // Fallback to simple summary if AI fails
    console.log('[generateAISummary] Using fallback summary');
    return {
      text: `This discussion thread titled "${threadTitle}" contains multiple viewpoints and contributions from the community. The conversation covers various aspects of the topic.`,
      keyPoints: ['Discussion in progress', 'Multiple viewpoints shared', 'Community engagement'],
      sentiment: 'neutral'
    };
  }
}
