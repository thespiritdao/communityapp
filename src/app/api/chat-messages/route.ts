// src/app/api/chat-messages/route.ts
import { NextResponse } from 'next/server';
import { supabase } from 'src/utils/supabaseClient';

export async function POST(request: Request) {
  const body = await request.json();
  const { content, attachments, sender_wallet_id, chat_group_id } = body;
  if (!content || !sender_wallet_id || !chat_group_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // Fetch the chat group's required token so we can store it on the message.
    const { data: groupData, error: groupError } = await supabase
      .from('chat_groups')
      .select('required_token')
      .eq('id', chat_group_id)
      .single();
    if (groupError || !groupData) {
      return NextResponse.json({ error: 'Invalid chat group' }, { status: 400 });
    }
    const required_token = groupData.required_token;

    // Insert the new message with its associated chat_group_id and inherited required_token.
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          content,
          attachments: attachments || [],
          sender_wallet_id,
          chat_group_id,
          required_token,
          created_at: new Date().toISOString(),
        },
      ])
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
