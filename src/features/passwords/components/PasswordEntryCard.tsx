'use client';

// Single vault entry display.
//
// Renders an encrypted entry in collapsed form. On click, decrypts the
// password client-side (using the user's vault identity) and shows it
// inside a read-only input that can be copied. Decryption happens only
// after explicit user action — we do NOT decrypt all entries on mount.
//
// The copy-to-clipboard button writes the password to the clipboard and
// schedules a best-effort clear after 30s. Modern browsers don't always
// honor the clear write, so the UI mentions the limitation.

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Pencil,
  Clock,
  AlertCircle,
} from 'lucide-react';
import type { VaultEntry } from '../services/vaultService';
import { openEntry, type IdentityKeypair } from '../crypto/vaultCrypto';

interface PasswordEntryCardProps {
  entry: VaultEntry;
  identity: IdentityKeypair;
  canManage: boolean;
  onEdit?: (entry: VaultEntry) => void;
  onDelete?: (entry: VaultEntry) => void;
}

export function PasswordEntryCard({
  entry,
  identity,
  canManage,
  onEdit,
  onDelete,
}: PasswordEntryCardProps) {
  const [revealed, setRevealed] = useState<{
    password: string;
    notes: string | null;
  } | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasWrap = !!entry.myWrappedKey;

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    if (!entry.myWrappedKey) {
      setError('You do not have a wrapped key for this entry yet.');
      return;
    }
    setDecrypting(true);
    setError(null);
    try {
      const opened = await openEntry({
        passwordCiphertext: entry.passwordCiphertext,
        passwordIv: entry.passwordIv,
        notesCiphertext: entry.notesCiphertext,
        notesIv: entry.notesIv,
        senderPubkey: entry.senderPubkey,
        myWrappedKey: entry.myWrappedKey,
        myIdentity: identity,
      });
      setRevealed(opened);
    } catch (e: any) {
      setError(e?.message || 'Decryption failed');
    } finally {
      setDecrypting(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Best-effort clipboard clear after 30s.
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {
          /* user moved focus — ignore */
        });
      }, 30_000);
    } catch (e) {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold truncate" style={{ color: '#1F453A' }}>
            {entry.label}
          </h4>
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          <p
            className="text-xs mt-1 flex items-center gap-1"
            style={{ color: '#9B948D' }}
          >
            <Clock className="h-3 w-3" />
            Updated {new Date(entry.updatedAt).toLocaleDateString()} · v
            {entry.version}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1 flex-shrink-0">
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(entry)}
                aria-label="Edit entry"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(entry)}
                aria-label="Delete entry"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasWrap ? (
        <div
          className="rounded p-3 text-xs flex items-start gap-2"
          style={{ backgroundColor: '#F4F1EC', color: '#5F5A54' }}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Pending grant — a pod manager needs to share this entry with
            you. You'll be able to read it once they do.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type={revealed ? 'text' : 'password'}
              readOnly
              value={revealed?.password ?? '••••••••••••'}
              className="flex-1 px-3 py-2 text-sm border rounded font-mono bg-white"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleReveal}
              disabled={decrypting}
              aria-label={revealed ? 'Hide password' : 'Show password'}
            >
              {revealed ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              disabled={!revealed}
              aria-label="Copy password"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {revealed?.notes && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#5F5A54' }}>
                Notes
              </p>
              <p
                className="text-sm whitespace-pre-wrap p-2 rounded border bg-white"
                style={{ color: '#1F1F1F' }}
              >
                {revealed.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: '#7A2E2E' }}>
          {error}
        </p>
      )}
    </Card>
  );
}
