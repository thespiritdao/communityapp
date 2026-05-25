'use client';

// Main vault panel.
//
// Top-level surface for the Password Vault module. Mounted by
// PodModulesManager when `passwords_enabled` is on and expanded.
//
// Flow:
//   1. Load identity via useVaultIdentity. If not bootstrapped, show
//      VaultBootstrapPrompt.
//   2. Once bootstrapped, list entries via the SDK.
//   3. Show pending grants banner (for managers) + rotation prompt
//      (for any active reader, surfaced inline as an action).
//   4. Allow add/edit/delete via the modal.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Search,
  RefreshCw,
  ShieldAlert,
  Loader2,
  ArrowDownUp,
} from 'lucide-react';
import { useVaultIdentity } from '../crypto/useVaultIdentity';
import {
  deleteEntry,
  getPendingGrants,
  getRecipients,
  getRotationJobs,
  listEntries,
  submitRotation,
  type VaultEntry,
  type VaultPendingGrant,
  type VaultRotationJob,
} from '../services/vaultService';
import {
  createEntryPayload,
  openEntry,
} from '../crypto/vaultCrypto';
import { VaultBootstrapPrompt } from './VaultBootstrapPrompt';
import { PasswordEntryCard } from './PasswordEntryCard';
import { AddPasswordModal } from './AddPasswordModal';
import { PendingGrantsBanner } from './PendingGrantsBanner';

interface PasswordVaultPanelProps {
  podId: string;
  /** Whether the current user has passwordsManage. Drives edit/add UI. */
  isManager: boolean;
}

export function PasswordVaultPanel({
  podId,
  isManager,
}: PasswordVaultPanelProps) {
  const {
    identity,
    publishedPubkey,
    status: identityStatus,
    error: identityError,
    bootstrap,
  } = useVaultIdentity();

  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [grants, setGrants] = useState<VaultPendingGrant[]>([]);
  const [rotations, setRotations] = useState<VaultRotationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [rotationRunning, setRotationRunning] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [entryList, grantList, rotationList] = await Promise.all([
        listEntries(podId),
        isManager ? getPendingGrants(podId) : Promise.resolve([]),
        getRotationJobs(podId),
      ]);
      setEntries(entryList);
      setGrants(grantList);
      setRotations(rotationList);
    } catch (e: any) {
      setError(e?.message || 'Failed to load vault');
    }
  }, [podId, isManager]);

  useEffect(() => {
    if (identityStatus !== 'ready') return;
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [identityStatus, loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (entry: VaultEntry) => {
    if (!confirm(`Delete "${entry.label}"? This cannot be undone.`)) return;
    try {
      await deleteEntry(podId, entry.id);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  };

  const handleRunRotation = async () => {
    if (!identity) return;
    setRotationRunning(true);
    setError(null);
    try {
      // Cache the unfiltered recipient list once; per-entry we filter
      // it down by the entry's allowed_role_ids.
      const allRecipients = await getRecipients(podId);

      for (const job of rotations) {
        // Re-encrypt every entry the rotator can read.
        const decryptedEntries: Array<{
          entry: VaultEntry;
          password: string;
          login: string | null;
          notes: string | null;
        }> = [];
        for (const e of entries) {
          if (!e.myWrappedKey) continue;
          const opened = await openEntry({
            passwordCiphertext: e.passwordCiphertext,
            passwordIv: e.passwordIv,
            loginCiphertext: e.loginCiphertext,
            loginIv: e.loginIv,
            notesCiphertext: e.notesCiphertext,
            notesIv: e.notesIv,
            senderPubkey: e.senderPubkey,
            myWrappedKey: e.myWrappedKey,
            myIdentity: identity,
          });
          decryptedEntries.push({
            entry: e,
            password: opened.password,
            login: opened.login,
            notes: opened.notes,
          });
        }

        const rotated = await Promise.all(
          decryptedEntries.map(async ({ entry, password, login, notes }) => {
            // Respect the per-entry audience. Empty allowedRoleIds means
            // "any reader" — use everyone with passwordsAccess.
            const audience =
              entry.allowedRoleIds.length === 0
                ? allRecipients
                : allRecipients.filter((r) =>
                    r.roleIds.some((id) =>
                      entry.allowedRoleIds.includes(id),
                    ),
                  );
            const eligible = audience.filter(
              (r) => r.hasPublishedKey && !!r.publicKey,
            );
            if (eligible.length === 0) {
              throw new Error(
                `Entry "${entry.label}" has no eligible recipients after rotation. Adjust its visibility or wait for members to bootstrap.`,
              );
            }
            const payload = await createEntryPayload({
              passwordPlaintext: password,
              loginPlaintext: login ?? undefined,
              notesPlaintext: notes ?? undefined,
              sender: identity,
              recipients: eligible.map((r) => ({
                eoaAddress: r.eoaAddress,
                publicKey: r.publicKey!,
              })),
            });
            return {
              entryId: entry.id,
              passwordCiphertext: payload.passwordCiphertext,
              passwordIv: payload.passwordIv,
              loginCiphertext: payload.loginCiphertext,
              loginIv: payload.loginIv,
              notesCiphertext: payload.notesCiphertext,
              notesIv: payload.notesIv,
              senderPubkey: payload.senderPubkey,
              wraps: payload.wraps,
            };
          }),
        );

        await submitRotation(podId, { jobId: job.id, entries: rotated });
      }
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Rotation failed');
    } finally {
      setRotationRunning(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, search]);

  // ── render ─────────────────────────────────────────────────────────────

  if (identityStatus === 'idle' || identityStatus === 'loading') {
    return (
      <Card className="p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm" style={{ color: '#5F5A54' }}>
          Loading vault…
        </span>
      </Card>
    );
  }

  if (identityStatus === 'needs-bootstrap' || identityStatus === 'error') {
    return (
      <VaultBootstrapPrompt bootstrap={bootstrap} error={identityError} />
    );
  }

  // identityStatus === 'ready'
  if (!identity) {
    return (
      <Card className="p-4 text-sm" style={{ color: '#7A2E2E' }}>
        Vault identity loaded but missing keys. Try refreshing.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isManager && grants.length > 0 && (
        <PendingGrantsBanner
          podId={podId}
          identity={identity}
          pendingGrants={grants}
          onGranted={loadAll}
        />
      )}

      {rotations.length > 0 && (
        <Card
          className="p-4 border-2"
          style={{ borderColor: '#7A2E2E', backgroundColor: '#FBEAEA' }}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="h-5 w-5 mt-0.5 flex-shrink-0"
              style={{ color: '#7A2E2E' }}
            />
            <div className="flex-1">
              <p className="font-medium" style={{ color: '#1F1F1F' }}>
                Vault needs rotation
              </p>
              <p className="text-xs mt-1" style={{ color: '#5F5A54' }}>
                {rotations.length} member
                {rotations.length === 1 ? '' : 's'} lost access. Rotate to
                re-encrypt every entry so future updates aren't readable
                by them. Past values they've already seen remain known to
                them — that's irrecoverable.
              </p>
            </div>
            <Button
              onClick={handleRunRotation}
              disabled={rotationRunning}
              variant="outline"
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              {rotationRunning ? 'Rotating…' : 'Rotate now'}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search
            className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2"
            style={{ color: '#9B948D' }}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label or tag…"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
        </Button>
        {isManager && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add password
          </Button>
        )}
      </div>

      {error && (
        <div
          className="rounded p-3 text-xs"
          style={{ backgroundColor: '#FBEAEA', color: '#7A2E2E' }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: '#5F5A54' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading entries…
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card className="p-6 text-center text-sm" style={{ color: '#5F5A54' }}>
          {search
            ? 'No entries match your search.'
            : 'No password entries yet. Add one to get started.'}
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredEntries.map((entry) => (
            <PasswordEntryCard
              key={entry.id}
              entry={entry}
              identity={identity}
              canManage={isManager}
              onEdit={isManager ? (e) => setEditing(e) : undefined}
              onDelete={isManager ? handleDelete : undefined}
            />
          ))}
        </div>
      )}

      {(showModal || editing) && (
        <AddPasswordModal
          podId={podId}
          identity={identity}
          existing={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
