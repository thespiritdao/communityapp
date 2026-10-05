/**
 * POST /api/events/[id]/register   { address, txHash? }
 *
 * Records a registration after the chain confirms it. Members can no longer
 * write payment facts on event_registrations themselves (see migration
 * 20260924000001): a paid registration only exists once EventManager says
 * one of the caller's Coinbase accounts is registered for the event.
 *
 * Auth, both required:
 *   - Supabase session (Authorization: Bearer) whose member owns `address`,
 *     directly or as a linked device wallet;
 *   - CDP access token (x-cdp-access-token) proving the caller controls
 *     `address`. Its account list also covers the smart account that sent
 *     registerForEvent, which is not the same address as the device wallet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Abi } from 'viem';
import { base } from 'viem/chains';
import EventManagerABI from '@/abis/EventManager.json';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { verifyCdpWalletOwnership } from '@/lib/cdpAuth';
import { walletsForBalanceCheck } from '@/services/userWalletsService';

export const runtime = 'nodejs';

const abi = ((EventManagerABI as { abi?: Abi }).abi ?? EventManagerABI) as Abi;
const isZeroPrice = (v: string | null | undefined) => /^0*(\.0*)?$/.test((v ?? '').trim() || '0');

function eventManager() {
  const address = process.env.NEXT_PUBLIC_EVENT_MANAGER as `0x${string}` | undefined;
  if (!address) throw new Error('NEXT_PUBLIC_EVENT_MANAGER is not set');
  const client = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
  return { address, client };
}

/**
 * Whether EventManager knows this event at all. The recurring community
 * calls (Town Hall, First Contact, Feedback Loops) were seeded straight into
 * the database with slug ids and were never created on-chain, so a
 * blockchain_event_id on the row does not by itself mean the contract has it.
 * A revert with "Event not found" is the contract's answer; any other failure
 * (RPC down, bad address) is rethrown so we fail closed rather than open.
 */
async function eventExistsOnchain(eventId: string): Promise<boolean> {
  const { address, client } = eventManager();
  try {
    await client.readContract({ address, abi, functionName: 'getEvent', args: [eventId] });
    return true;
  } catch (err) {
    const text = [(err as { shortMessage?: string }).shortMessage, (err as Error).message]
      .filter(Boolean)
      .join('\n');
    if (/Event not found/i.test(text)) return false;
    throw err;
  }
}

async function registeredOnchain(eventId: string, accounts: string[]): Promise<boolean> {
  const { address, client } = eventManager();
  // The receipt is in, but give a lagging RPC node one more chance.
  for (let attempt = 0; attempt < 2; attempt++) {
    const results = await Promise.all(
      accounts.map((user) =>
        client.readContract({ address, abi, functionName: 'isRegisteredForEvent', args: [eventId, user] }),
      ),
    );
    if (results.some(Boolean)) return true;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const body = await request.json().catch(() => null);
  const address: string | undefined = body?.address?.toLowerCase();
  const txHash: string | null = typeof body?.txHash === 'string' ? body.txHash : null;

  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  if (!address || !(await walletsForBalanceCheck(walletOrDenied)).includes(address)) {
    return NextResponse.json({ error: 'That wallet is not linked to your account' }, { status: 403 });
  }

  const cdp = await verifyCdpWalletOwnership(request, address, body);
  if (!cdp.ok) return NextResponse.json({ error: cdp.error }, { status: cdp.status });

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, status, blockchain_event_id, price_amount, price_self_amount, price_token')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (event.status === 'cancelled') {
    return NextResponse.json({ error: 'This event has been cancelled' }, { status: 409 });
  }

  const free = isZeroPrice(event.price_amount) && isZeroPrice(event.price_self_amount);
  // Paid events are always proven against the contract. Free events are proven
  // too when the contract has the event; a free event the contract has never
  // heard of (the seeded recurring calls) is recorded in the database only,
  // which is what the registration modal falls back to as well.
  const onchain =
    !!event.blockchain_event_id &&
    (!free || (await eventExistsOnchain(event.blockchain_event_id)));
  if (onchain) {
    if (!(await registeredOnchain(event.blockchain_event_id as string, cdp.accounts))) {
      return NextResponse.json(
        { error: 'The event contract does not show this registration yet' },
        { status: 409 },
      );
    }
  } else if (!free) {
    return NextResponse.json({ error: 'Paid events must be registered on-chain' }, { status: 409 });
  }

  // A repeat call must not undo a check-in or completion.
  const { data: existing } = await supabaseAdmin
    .from('event_registrations')
    .select('*')
    .eq('event_id', event.id)
    .eq('user_address', address)
    .maybeSingle();
  if (existing && ['checked_in', 'completed'].includes(existing.registration_status)) {
    return NextResponse.json({ registration: existing });
  }

  const { data: registration, error } = await supabaseAdmin
    .from('event_registrations')
    .upsert(
      {
        event_id: event.id,
        user_address: address,
        registration_status: 'registered',
        payment_amount: free ? '0' : event.price_amount || event.price_self_amount,
        payment_token: event.price_token,
        payment_tx_hash: txHash,
        payment_status: 'completed',
        registered_at: new Date().toISOString(),
        cancelled_at: null,
      },
      { onConflict: 'event_id,user_address' },
    )
    .select()
    .single();

  if (error) {
    console.error('❌ events/register: upsert failed', error);
    return NextResponse.json({ error: 'Could not record the registration' }, { status: 500 });
  }
  return NextResponse.json({ registration });
}
