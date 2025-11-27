import type { NextRequest } from 'next/server';
import { handleSSE } from '../route';
import { requestLogger, createErrorResponse } from '../../middleware';

/**
 * Server-Sent Events endpoint for real-time marketplace updates
 * GET /api/marketplace/websocket/sse
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const endpoint = '/api/marketplace/websocket/sse';
  
  try {
    // Log the request
    requestLogger(request, endpoint);
    
    // Validate parameters
    const { searchParams } = new URL(request.url);
    const channels = searchParams.get('channels')?.split(',') || ['general'];
    const address = searchParams.get('address');
    
    // Validate channels
    const validChannels = ['general', 'products', 'orders', 'inventory'];
    const invalidChannels = channels.filter(ch => 
      !validChannels.includes(ch) && 
      !ch.startsWith('user_') && 
      !ch.startsWith('product_')
    );
    
    if (invalidChannels.length > 0) {
      return createErrorResponse(
        'Invalid channels',
        400,
        request,
        endpoint,
        { invalidChannels, validChannels }
      );
    }
    
    // Limit number of channels per connection
    if (channels.length > 10) {
      return createErrorResponse(
        'Too many channels',
        400,
        request,
        endpoint,
        { maxChannels: 10, requested: channels.length }
      );
    }
    
    console.log(`🌐 SSE connection requested - Address: ${address || 'anonymous'}, Channels: ${channels.join(', ')}`);
    
    // Handle the SSE connection
    return await handleSSE(request);
    
  } catch (error) {
    console.error('SSE endpoint error:', error);
    
    return createErrorResponse(
      'SSE connection failed',
      500,
      request,
      endpoint,
      { 
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control',
      'Access-Control-Max-Age': '86400',
    },
  });
}