/**
 * Who may issue and verify event check-in QR tokens. Server-side only.
 *
 * Organizer = the event's creator or manager is one of the caller's wallets
 * (canonical or linked), mirroring the is_event_organizer() SQL helper.
 */

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { walletsForBalanceCheck } from '@/services/userWalletsService';

export async function callerWallets(wallet: string): Promise<string[]> {
  return (await walletsForBalanceCheck(wallet)).map((w) => w.toLowerCase());
}

export async function isEventOrganizer(eventId: string, wallets: string[]): Promise<boolean> {
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creator_address, manager_address')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return false;
  return [event.creator_address, event.manager_address]
    .filter(Boolean)
    .some((a) => wallets.includes(String(a).toLowerCase()));
}
