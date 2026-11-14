// src/app/api/sensemaker/chat/route.ts

import { sensemakerAllowedOrigins } from '@/config/deployment.server';
import { pineconeIndexName } from '@/config/deployment.server';
import { NextRequest, NextResponse } from 'next/server';
import { classifyQuery } from '@/services/sensemaker/routingService';
import { queryPinecone } from '@/services/sensemaker/pineconeService';
import { generateResponse } from '@/services/sensemaker/responseService';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  rateLimiters,
  getClientIp,
  rateLimitErrorResponse,
  isRateLimitingEnabled,
} from '@/lib/ratelimit';

/**
 * CORS — the public Sensemaker widget can be embedded on another site (for
 * example the organisation's marketing site), so cross-origin requests are
 * allowed for the origins in SENSEMAKER_ALLOWED_ORIGINS (default: the app).
 */
const allowedOrigins = () => new Set([...sensemakerAllowedOrigins(), 'http://localhost:3000']);

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  if (!allowedOrigins().has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

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
  let step = 'init';

  try {
    // Step 0: Rate limiting (CRITICAL - prevents expensive AI API abuse)
    // Backed by Supabase Postgres (rate_limit_hit RPC)
    step = 'ratelimit';
    const clientIp = getClientIp(req);
    let limit = 0, remaining = 0, reset = 0;
    try {
      const rl = await rateLimiters.sensemaker.limit(clientIp);
      limit = rl.limit;
      remaining = rl.remaining;
      reset = rl.reset;

      if (!rl.success) {
        console.warn(`[Sensemaker Chat] Rate limit exceeded for IP: ${clientIp}`);
        return NextResponse.json(rateLimitErrorResponse(reset), {
          status: 429,
          headers: {
            ...corsHeaders(req),
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        });
      }
    } catch (rlError) {
      // Fail CLOSED when rate limiting is configured but the database call
      // fails — this endpoint spends real LLM tokens per request. The no-op
      // path (service key not configured, i.e. local dev) never throws and
      // stays open.
      if (isRateLimitingEnabled()) {
        console.error('[Sensemaker Chat] Rate limiter unreachable — failing closed:', rlError);
        return NextResponse.json(
          { error: 'Service temporarily unavailable. Please try again shortly.' },
          { status: 503, headers: corsHeaders(req) },
        );
      }
      console.error('[Sensemaker Chat] Rate limiter error (not configured), allowing request:', rlError);
    }

    step = 'parse';
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

    // Step 1: Classify the query
    step = 'classify';
    const queryType = await classifyQuery(message);

    // Step 2: Retrieve relevant context from Pinecone
    step = 'pinecone';
    const contexts = await queryPinecone(message, queryType, 5);

    // Step 3: Generate response using appropriate model
    step = 'generate';
    const model =
      queryType === 'spiritdao' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';

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
      bearerToken: req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null,
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
          ...corsHeaders(req),
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to process message',
        step,
        details: error.message,
        errorType: error.constructor?.name,
        cause: error.cause ? String(error.cause) : undefined,
      },
      { status: 500, headers: corsHeaders(req) },
    );
  }
}

/**
 * GET endpoint for health check
 */
export async function GET(req: NextRequest) {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // Check env vars present
  const requiredEnvVars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PINECONE_API_KEY'];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  checks.envVars = missing.length === 0
    ? { ok: true }
    : { ok: false, error: `Missing: ${missing.join(', ')}` };

  // Live-test Anthropic
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    });
    checks.anthropic = { ok: true };
  } catch (e: any) {
    checks.anthropic = { ok: false, error: e.message };
  }

  // Live-test OpenAI
  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'ping',
      dimensions: 8,
    });
    checks.openai = { ok: true };
  } catch (e: any) {
    checks.openai = { ok: false, error: e.message };
  }

  // Live-test Pinecone
  try {
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    await pc.index(pineconeIndexName()).describeIndexStats();
    checks.pinecone = { ok: true };
  } catch (e: any) {
    checks.pinecone = { ok: false, error: e.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      models: {
        routing: 'claude-haiku-4-5-20251001',
        dao: 'claude-haiku-4-5-20251001',
        philosophy: 'claude-sonnet-4-6',
      },
      checks,
    },
    { status: allOk ? 200 : 500 },
  );
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
  bearerToken,
}: {
  bearerToken: string | null;
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
    // Attribute the log to a member only when the request carries their
    // Supabase session token; otherwise it is logged anonymously. The route
    // itself has no session, so it writes with the service-role client.
    const user = bearerToken
      ? (await supabaseAdmin.auth.getUser(bearerToken)).data.user
      : null;

    let walletAddress = null;
    if (user) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('wallet_address')
        .eq('user_id', user.id)
        .maybeSingle();

      walletAddress = profile?.wallet_address || null;
    }

    // Log user message
    await supabaseAdmin.from('sensemaker_conversations').insert({
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
    await supabaseAdmin.from('sensemaker_conversations').insert({
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
