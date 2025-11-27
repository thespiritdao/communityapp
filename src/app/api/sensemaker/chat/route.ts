// src/app/api/sensemaker/chat/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { classifyQuery } from '@/services/sensemaker/routingService';
import { queryPinecone } from '@/services/sensemaker/pineconeService';
import { generateResponse } from '@/services/sensemaker/responseService';
import { createClient } from '@/utils/supabaseClient';
import {
  rateLimiters,
  getClientIp,
  rateLimitErrorResponse,
} from '@/lib/ratelimit';

/**
 * Sensemaker AI Chat API
 *
 * Unified chat endpoint that routes queries to appropriate knowledge bases:
 * - SpiritDAO: DAO operations, app features, technical support
 * - Temporal Naturalism: Philosophy, theology, academic inquiry
 *
 * Flow:
 * 1. Rate limiting (10 requests/min per IP) → prevents abuse
 * 2. Classify query (GPT-4o-mini) → determines knowledge base
 * 3. Retrieve context (Pinecone) → gets relevant documentation
 * 4. Generate response (appropriate model) → answers question
 * 5. Log conversation to database for analytics
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Step 0: Rate limiting (CRITICAL - prevents expensive AI API abuse)
    const clientIp = getClientIp(req);
    const { success, limit, remaining, reset } =
      await rateLimiters.sensemaker.limit(clientIp);

    if (!success) {
      console.warn(`[Sensemaker Chat] Rate limit exceeded for IP: ${clientIp}`);
      return NextResponse.json(rateLimitErrorResponse(reset), {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      });
    }

    console.log(
      `[Sensemaker Chat] Rate limit check passed: ${remaining}/${limit} remaining`,
    );

    const { message, conversationHistory, sessionId } = await req.json();

    // Validate input
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 },
      );
    }

    if (message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 },
      );
    }

    console.log('─────────────────────────────────────────────');
    console.log('[Sensemaker Chat] New request received');
    console.log('[Sensemaker Chat] Message:', message.substring(0, 100));

    // Step 1: Classify the query (GPT-4o-mini)
    console.log('[Sensemaker Chat] Step 1: Classifying query...');
    const queryType = await classifyQuery(message);
    console.log('[Sensemaker Chat] Query classified as:', queryType);

    // Step 2: Retrieve relevant context from Pinecone
    console.log(
      '[Sensemaker Chat] Step 2: Retrieving context from Pinecone...',
    );
    const contexts = await queryPinecone(message, queryType, 5);
    console.log(
      '[Sensemaker Chat] Retrieved',
      contexts.length,
      'context chunks',
    );

    if (contexts.length > 0) {
      console.log(
        '[Sensemaker Chat] Top relevance score:',
        (contexts[0].score * 100).toFixed(1) + '%',
      );
    } else {
      console.warn(
        '[Sensemaker Chat] No context retrieved - will respond without knowledge base',
      );
    }

    // Step 3: Generate response using appropriate model
    console.log('[Sensemaker Chat] Step 3: Generating response...');
    const model =
      queryType === 'spiritdao' ? 'gpt-4o-mini' : 'claude-sonnet-4.5';
    console.log('[Sensemaker Chat] Using model:', model);

    const response = await generateResponse(
      message,
      contexts,
      queryType,
      conversationHistory || [],
    );

    console.log('[Sensemaker Chat] Response generated successfully');
    console.log(
      '[Sensemaker Chat] Response length:',
      response.length,
      'characters',
    );

    const responseTime = Date.now() - startTime;
    const topRelevanceScore = contexts.length > 0 ? contexts[0].score : null;

    // Log conversation to database (async, don't block response)
    logConversation({
      sessionId: sessionId || null,
      userMessage: message,
      assistantResponse: response,
      queryType,
      model,
      contextCount: contexts.length,
      relevanceScore: topRelevanceScore,
      responseTimeMs: responseTime,
      conversationHistory: conversationHistory || [],
    }).catch((error) => {
      console.error('[Sensemaker Chat] Failed to log conversation:', error);
      // Don't fail the request if logging fails
    });

    console.log('─────────────────────────────────────────────');

    // Return response with metadata and rate limit headers
    return NextResponse.json(
      {
        response,
        queryType,
        model,
        contextCount: contexts.length,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || null,
      },
      {
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      },
    );
  } catch (error: any) {
    console.error('─────────────────────────────────────────────');
    console.error('[Sensemaker Chat] ERROR:', error);
    console.error('[Sensemaker Chat] Error message:', error.message);
    console.error('[Sensemaker Chat] Error stack:', error.stack);
    console.error('─────────────────────────────────────────────');

    return NextResponse.json(
      {
        error: 'Failed to process message',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint for health check
 */
export async function GET(req: NextRequest) {
  try {
    // Check if required environment variables are set
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'PINECONE_API_KEY',
    ];

    const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required environment variables',
          missing,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: 'healthy',
      message: 'Sensemaker AI Chat API is operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      features: {
        routing: 'gpt-4o-mini',
        daoSupport: 'gpt-4o-mini',
        philosophy: 'claude-sonnet-4.5',
        vectorSearch: 'pinecone',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}

/**
 * Log conversation to Supabase for analytics and debugging
 */
async function logConversation({
  sessionId,
  userMessage,
  assistantResponse,
  queryType,
  model,
  contextCount,
  relevanceScore,
  responseTimeMs,
  conversationHistory,
}: {
  sessionId: string | null;
  userMessage: string;
  assistantResponse: string;
  queryType: 'spiritdao' | 'temporal-naturalism';
  model: string;
  contextCount: number;
  relevanceScore: number | null;
  responseTimeMs: number;
  conversationHistory: any[];
}) {
  try {
    const supabase = createClient();

    // Get user info if authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get wallet address from profiles if user is authenticated
    let walletAddress = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_address')
        .eq('id', user.id)
        .single();

      walletAddress = profile?.wallet_address || null;
    }

    // Log user message
    await supabase.from('sensemaker_conversations').insert({
      user_id: user?.id || null,
      user_address: walletAddress,
      role: 'user',
      content: userMessage,
      query_type: null,
      model: null,
      context_count: null,
      response_time_ms: null,
      session_id: sessionId,
      conversation_history: conversationHistory,
      relevance_score: null,
    });

    // Log assistant response
    await supabase.from('sensemaker_conversations').insert({
      user_id: user?.id || null,
      user_address: walletAddress,
      role: 'assistant',
      content: assistantResponse,
      query_type: queryType,
      model: model,
      context_count: contextCount,
      response_time_ms: responseTimeMs,
      session_id: sessionId,
      conversation_history: conversationHistory,
      relevance_score: relevanceScore,
    });

    console.log('[Sensemaker Chat] Conversation logged to database');
  } catch (error) {
    console.error('[Sensemaker Chat] Database logging error:', error);
    // Don't throw - logging failure shouldn't break the chat
  }
}
