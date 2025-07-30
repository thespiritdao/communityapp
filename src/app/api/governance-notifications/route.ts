import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with service key (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      recipient_address,
      sender_address,
      notification_type,
      title,
      message,
      context_url,
      context_type,
      context_id,
      proposal_id,
      transaction_hash
    } = body;

    // Validate required fields
    if (!recipient_address || !sender_address || !notification_type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert notification using service key (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('governance_notifications')
      .insert([{
        recipient_address,
        sender_address,
        notification_type,
        title,
        message,
        context_url,
        context_type,
        context_id,
        proposal_id,
        transaction_hash,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating governance notification:', error);
      return NextResponse.json(
        { error: 'Failed to create notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 