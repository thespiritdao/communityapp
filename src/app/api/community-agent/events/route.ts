// src/app/api/community-agent/events/route.ts
//
// GET: List draft events created by the community agent for a pod.
// PUT: Approve (publish), edit, or reject a draft event.
//
// Only pod leaders can manage agent-generated event drafts.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { AGENT_PSEUDO_WALLET, deriveAgentWallet } from '@/services/communityAgent/types';
import { getAgentConfig } from '@/services/communityAgent/configService';

export const runtime = 'nodejs';

/**
 * GET: Fetch agent-generated draft events for a pod.
 * Query params: podId (required), status (optional, defaults to 'draft')
 */
export async function GET(req: NextRequest) {
  const podId = req.nextUrl.searchParams.get('podId');
  const status = req.nextUrl.searchParams.get('status') || 'draft';

  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  // Query events created by either the per-pod agent wallet or legacy pseudo wallet
  const config = await getAgentConfig(podId);
  const agentWallet = config?.agentWallet || deriveAgentWallet(podId);
  const wallets = [agentWallet, AGENT_PSEUDO_WALLET];

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, title, description, event_date, event_end_date, location, max_attendees, status, event_metadata, created_at')
    .eq('organizing_pod_id', podId)
    .in('creator_address', wallets)
    .eq('status', status)
    .order('event_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events || [] });
}

/**
 * PUT: Approve, edit, or reject an agent-generated event.
 * Body: { eventId, action: 'publish' | 'reject' | 'edit', updates?: {...} }
 */
export async function PUT(req: NextRequest) {
  // Audit F5: the leader check compared pod_leads against a wallet taken from
  // the request body, which anyone can set. It now uses the session wallet;
  // the body's walletAddress is ignored.
  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const walletAddress = walletOrDenied;

  const body = await req.json();
  const { eventId, action, updates } = body;

  if (!eventId || !action || !walletAddress) {
    return NextResponse.json(
      { error: 'eventId, action, and walletAddress are required' },
      { status: 400 },
    );
  }

  // Get the event to verify ownership
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, organizing_pod_id, status, creator_address')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Verify this is an agent-generated event
  const eventConfig = await getAgentConfig(event.organizing_pod_id);
  const eventAgentWallet = eventConfig?.agentWallet || deriveAgentWallet(event.organizing_pod_id);
  const isAgentEvent = event.creator_address === AGENT_PSEUDO_WALLET
    || event.creator_address === eventAgentWallet;

  if (!isAgentEvent) {
    return NextResponse.json({ error: 'Only agent-generated events can be managed here' }, { status: 400 });
  }

  // Verify caller is a pod leader
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', event.organizing_pod_id)
    .single();

  const isLeader = pod?.pod_leads?.some(
    (lead: string) => lead.toLowerCase() === walletAddress.toLowerCase(),
  );

  if (!isLeader) {
    return NextResponse.json({ error: 'Only pod leaders can manage event drafts' }, { status: 403 });
  }

  switch (action) {
    case 'publish': {
      // Optionally apply edits before publishing
      const updatePayload: Record<string, any> = {
        status: 'published',
        updated_at: new Date().toISOString(),
      };

      if (updates?.title) updatePayload.title = updates.title;
      if (updates?.description) updatePayload.description = updates.description;
      if (updates?.event_date) updatePayload.event_date = updates.event_date;
      if (updates?.event_end_date) updatePayload.event_end_date = updates.event_end_date;
      if (updates?.location) updatePayload.location = updates.location;
      if (updates?.max_attendees) updatePayload.max_attendees = updates.max_attendees;

      const { error } = await supabaseAdmin
        .from('events')
        .update(updatePayload)
        .eq('id', eventId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'published' });
    }

    case 'reject': {
      const { error } = await supabaseAdmin
        .from('events')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    case 'edit': {
      if (!updates || Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
      }

      const allowed = ['title', 'description', 'event_date', 'event_end_date', 'location', 'max_attendees'];
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };

      for (const key of allowed) {
        if (updates[key] !== undefined) {
          updatePayload[key] = updates[key];
        }
      }

      const { error } = await supabaseAdmin
        .from('events')
        .update(updatePayload)
        .eq('id', eventId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'draft' });
    }

    default:
      return NextResponse.json({ error: 'Invalid action. Use: publish, reject, edit' }, { status: 400 });
  }
}
