'use client';

// Create or edit a vault entry.
//
// Builds the encrypted payload client-side using vaultCrypto, then
// POSTs (or PUTs) to the vault API. The label and tags travel in
// plaintext — they're indexed for search. The password and notes are
// encrypted with a fresh content key, which is then wrapped to every
// recipient that has a published vault pubkey.
//
// Recipients without a published pubkey are flagged in the UI; they
// can't be wrapped to until they bootstrap their identity. We DO NOT
// block submission on this — managers can ship the entry to whoever's
// ready and the rest get pending grants on next refresh.

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, AlertCircle } from 'lucide-react';
import {
  createEntryPayload,
  openEntry,
  type IdentityKeypair,
} from '../crypto/vaultCrypto';
import {
  createEntry,
  getRecipients,
  getRoles,
  updateEntry,
  type VaultEntry,
  type VaultRecipient,
  type VaultRole,
} from '../services/vaultService';

interface AddPasswordModalProps {
  podId: string;
  identity: IdentityKeypair;
  /** When provided, edit this entry instead of creating a new one. */
  existing?: VaultEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AddPasswordModal({
  podId,
  identity,
  existing,
  onClose,
  onSaved,
}: AddPasswordModalProps) {
  const isEdit = !!existing;

  const [label, setLabel] = useState(existing?.label ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [recipients, setRecipients] = useState<VaultRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [roles, setRoles] = useState<VaultRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  // Roles whose holders can read this entry. Empty = "any reader."
  // Default: pre-select the existing entry's audience on edit, or
  // leader roles when creating new.
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    () => new Set(existing?.allowedRoleIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  // Decrypt existing entry on mount so the edit form shows current values.
  useEffect(() => {
    if (!existing) return;
    let cancelled = false;
    (async () => {
      try {
        if (!existing.myWrappedKey) {
          setError(
            'Cannot edit — you do not have a wrapped key for this entry.',
          );
          return;
        }
        const opened = await openEntry({
          passwordCiphertext: existing.passwordCiphertext,
          passwordIv: existing.passwordIv,
          loginCiphertext: existing.loginCiphertext,
          loginIv: existing.loginIv,
          notesCiphertext: existing.notesCiphertext,
          notesIv: existing.notesIv,
          senderPubkey: existing.senderPubkey,
          myWrappedKey: existing.myWrappedKey,
          myIdentity: identity,
        });
        if (cancelled) return;
        setPassword(opened.password);
        setLogin(opened.login ?? '');
        setNotes(opened.notes ?? '');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to decrypt existing entry');
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existing, identity]);

  // Load pod roles (audience picker) and seed default selection on
  // create (leader roles auto-checked).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getRoles(podId);
        if (cancelled) return;
        setRoles(list);
        if (!isEdit) {
          // Default audience for new entries: leader roles. Member roles
          // remain unchecked so the creator explicitly opts them in.
          const defaults = new Set(
            list
              .filter(
                (r) =>
                  r.hasPasswordsManage ||
                  /leader/i.test(r.name) ||
                  /leader/i.test(r.type),
              )
              .map((r) => r.id),
          );
          if (defaults.size > 0) setSelectedRoleIds(defaults);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load roles');
      } finally {
        if (!cancelled) setLoadingRoles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId, isEdit]);

  // Recipients reload whenever the role selection changes — server
  // filters to only those holding one of the checked roles.
  useEffect(() => {
    let cancelled = false;
    setLoadingRecipients(true);
    (async () => {
      try {
        const filterIds =
          selectedRoleIds.size > 0 ? [...selectedRoleIds] : undefined;
        const list = await getRecipients(podId, filterIds);
        if (!cancelled) setRecipients(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load recipients');
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId, selectedRoleIds]);

  const eligibleRecipients = useMemo(
    () => recipients.filter((r) => r.hasPublishedKey && !!r.publicKey),
    [recipients],
  );
  const pendingRecipients = useMemo(
    () => recipients.filter((r) => !r.hasPublishedKey),
    [recipients],
  );

  // Roles that hold passwordsManage are always implicitly in the
  // audience — we don't let the creator lock managers out of their own
  // pod's vault. Render them as checked-and-disabled.
  const isLockedManagerRole = (r: VaultRole) => r.hasPasswordsManage;
  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = async () => {
    setError(null);

    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (eligibleRecipients.length === 0) {
      setError(
        'No recipients have published a vault key yet. At least one member (including yourself) must bootstrap before saving an entry.',
      );
      return;
    }

    setSubmitting(true);
    try {
      // Manager roles are implicitly always included.
      const finalRoleIds = new Set(selectedRoleIds);
      for (const r of roles) {
        if (isLockedManagerRole(r)) finalRoleIds.add(r.id);
      }

      const payload = await createEntryPayload({
        passwordPlaintext: password,
        loginPlaintext: login || undefined,
        notesPlaintext: notes || undefined,
        sender: identity,
        recipients: eligibleRecipients.map((r) => ({
          eoaAddress: r.eoaAddress,
          publicKey: r.publicKey!,
        })),
      });

      const body = {
        label: label.trim(),
        tags,
        allowedRoleIds: [...finalRoleIds],
        passwordCiphertext: payload.passwordCiphertext,
        passwordIv: payload.passwordIv,
        loginCiphertext: payload.loginCiphertext,
        loginIv: payload.loginIv,
        notesCiphertext: payload.notesCiphertext,
        notesIv: payload.notesIv,
        senderPubkey: payload.senderPubkey,
        wraps: payload.wraps,
      };

      if (isEdit && existing) {
        await updateEntry(podId, existing.id, body);
      } else {
        await createEntry(podId, body);
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg p-6 my-8 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg" style={{ color: '#1F453A' }}>
            {isEdit ? 'Edit entry' : 'New password entry'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="vault-label">Label</Label>
            <Input
              id="vault-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Mailchimp admin"
              disabled={submitting || loadingExisting}
            />
            <p className="text-xs mt-1" style={{ color: '#9B948D' }}>
              Stored in plaintext for search. Don't put secrets here.
            </p>
          </div>

          <div>
            <Label htmlFor="vault-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="vault-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Press Enter to add"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                disabled={submitting}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTag}
                disabled={submitting}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-xs cursor-pointer"
                    onClick={() => removeTag(t)}
                  >
                    {t} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Visible to</Label>
            {loadingRoles ? (
              <p className="text-xs" style={{ color: '#9B948D' }}>
                Loading roles…
              </p>
            ) : roles.length === 0 ? (
              <p className="text-xs" style={{ color: '#9B948D' }}>
                No roles configured for this pod.
              </p>
            ) : (
              <div className="space-y-1 border rounded p-2">
                {roles
                  .filter(
                    (r) => r.hasPasswordsAccess || isLockedManagerRole(r),
                  )
                  .map((r) => {
                    const locked = isLockedManagerRole(r);
                    const checked = locked || selectedRoleIds.has(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked || submitting}
                          onChange={() => toggleRole(r.id)}
                        />
                        <span style={{ color: '#1F1F1F' }}>{r.name}</span>
                        {locked && (
                          <span
                            className="text-xs"
                            style={{ color: '#9B948D' }}
                          >
                            (manager — always included)
                          </span>
                        )}
                      </label>
                    );
                  })}
              </div>
            )}
            <p className="text-xs mt-1" style={{ color: '#9B948D' }}>
              Only members holding a checked role get a wrapped copy of
              this entry. Managers are always included.
            </p>
          </div>

          <div>
            <Label htmlFor="vault-login">Login (optional)</Label>
            <Input
              id="vault-login"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={
                loadingExisting ? 'Decrypting…' : 'username, email, or account ID'
              }
              disabled={submitting || loadingExisting}
              autoComplete="off"
            />
            <p className="text-xs mt-1" style={{ color: '#9B948D' }}>
              Encrypted alongside the password. Server never sees it.
            </p>
          </div>

          <div>
            <Label htmlFor="vault-password">Password</Label>
            <Input
              id="vault-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={loadingExisting ? 'Decrypting…' : 'Paste password'}
              disabled={submitting || loadingExisting}
              className="font-mono"
            />
          </div>

          <div>
            <Label htmlFor="vault-notes">Notes (optional)</Label>
            <textarea
              id="vault-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Login URL, MFA recovery hints, etc."
              disabled={submitting || loadingExisting}
              rows={3}
              className="w-full px-3 py-2 text-sm border rounded resize-y"
            />
          </div>

          <div
            className="rounded p-3 text-xs"
            style={{ backgroundColor: '#F4F1EC', color: '#5F5A54' }}
          >
            {loadingRecipients ? (
              <p>Loading recipient list…</p>
            ) : (
              <>
                <p className="mb-1">
                  <strong>{eligibleRecipients.length}</strong> recipient
                  {eligibleRecipients.length === 1 ? '' : 's'} will receive
                  this entry on save.
                </p>
                {pendingRecipients.length > 0 && (
                  <p className="flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {pendingRecipients.length} member
                    {pendingRecipients.length === 1 ? '' : 's'} haven't
                    bootstrapped their vault keys yet. They'll be granted
                    automatically once they do.
                  </p>
                )}
              </>
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
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || loadingExisting || loadingRecipients}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save entry'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
