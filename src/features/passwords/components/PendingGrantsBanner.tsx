'use client';

// "N members are waiting for vault access" banner.
//
// Shown to users with passwordsManage when there are pending grants in
// the current pod. Click handler walks every pending (entry × newcomer):
//   1. Fetch the newcomer's vault pubkey from the server.
//   2. Decrypt the content key of each entry using the manager's identity.
//   3. Re-wrap the content key to the newcomer.
//   4. POST the batch of wraps back; pending rows are cleared.

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, AlertTriangle } from 'lucide-react';
import {
  type IdentityKeypair,
  unwrapContentKey,
  wrapContentKey,
} from '../crypto/vaultCrypto';
import {
  getEntry,
  getUserPubkeys,
  submitGrants,
  type VaultPendingGrant,
} from '../services/vaultService';

interface PendingGrantsBannerProps {
  podId: string;
  identity: IdentityKeypair;
  pendingGrants: VaultPendingGrant[];
  onGranted: () => void;
}

export function PendingGrantsBanner({
  podId,
  identity,
  pendingGrants,
  onGranted,
}: PendingGrantsBannerProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendingGrants.length === 0) return null;

  const uniqueNewcomers = Array.from(
    new Set(pendingGrants.map((g) => g.newcomerEoa)),
  );

  const handleGrantAll = async () => {
    setWorking(true);
    setError(null);
    try {
      // 1. Look up all newcomers' pubkeys in one batch.
      const pubkeys = await getUserPubkeys(uniqueNewcomers);

      // 2. Group grants by entry so we only decrypt each entry once.
      const byEntry = new Map<string, string[]>(); // entryId -> [newcomerEoa]
      for (const g of pendingGrants) {
        const list = byEntry.get(g.entryId) ?? [];
        list.push(g.newcomerEoa);
        byEntry.set(g.entryId, list);
      }

      const wrapsToSubmit: Array<{
        entryId: string;
        recipientEoa: string;
        senderPubkey: string;
        wrappedKey: string;
      }> = [];

      for (const [entryId, newcomers] of byEntry.entries()) {
        // Fetch the entry to get its sender pubkey + the manager's wrap.
        const entry = await getEntry(podId, entryId);
        if (!entry.myWrappedKey) {
          // Manager doesn't have a wrap for this entry — can't grant.
          // Skip and surface as a warning at the end.
          continue;
        }

        // Decrypt the content key.
        const contentKeyB64 = await unwrapContentKey({
          wrappedB64: entry.myWrappedKey,
          recipientSecretKeyB64: identity.secretKey,
          recipientPublicKeyB64: identity.publicKey,
          senderPublicKeyB64: entry.senderPubkey,
        });

        // Wrap for each newcomer who has a pubkey published.
        for (const newcomerEoa of newcomers) {
          const newcomerPk = pubkeys[newcomerEoa.toLowerCase()];
          if (!newcomerPk) {
            // Pubkey not published yet — leave the pending row alone.
            continue;
          }
          const wrappedKey = await wrapContentKey({
            contentKeyB64,
            // From this manager's POV they are the "sender" for the
            // new wrap, so use their own keypair as sender. The AAD on
            // future unwraps will use (manager-pubkey, newcomer-pubkey),
            // which matches what we pass here.
            senderSecretKeyB64: identity.secretKey,
            senderPublicKeyB64: identity.publicKey,
            recipientPublicKeyB64: newcomerPk,
          });
          wrapsToSubmit.push({
            entryId,
            recipientEoa: newcomerEoa.toLowerCase(),
            senderPubkey: identity.publicKey,
            wrappedKey,
          });
        }
      }

      if (wrapsToSubmit.length === 0) {
        setError(
          'No grants could be issued — newcomers may not have published their vault keys yet, or you may not hold the content keys.',
        );
      } else {
        await submitGrants(podId, { wraps: wrapsToSubmit });
        onGranted();
      }
    } catch (e: any) {
      setError(e?.message || 'Grant failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card
      className="p-4 border-2"
      style={{ borderColor: '#C6933F', backgroundColor: '#FAF4EC' }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFF' }}>
          <UserPlus className="h-5 w-5" style={{ color: '#C6933F' }} />
        </div>
        <div className="flex-1">
          <p className="font-medium" style={{ color: '#1F1F1F' }}>
            {uniqueNewcomers.length} member
            {uniqueNewcomers.length === 1 ? '' : 's'} waiting for vault
            access
          </p>
          <p className="text-xs mt-1" style={{ color: '#5F5A54' }}>
            {pendingGrants.length} grant
            {pendingGrants.length === 1 ? '' : 's'} pending. Click below to
            re-wrap content keys for the new members. This happens in your
            browser — the server still can't read your passwords.
          </p>
          {error && (
            <div
              className="rounded p-2 text-xs mt-2 flex items-start gap-1"
              style={{ backgroundColor: '#FBEAEA', color: '#7A2E2E' }}
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
        <Button onClick={handleGrantAll} disabled={working}>
          {working ? 'Granting…' : 'Grant all'}
        </Button>
      </div>
    </Card>
  );
}
