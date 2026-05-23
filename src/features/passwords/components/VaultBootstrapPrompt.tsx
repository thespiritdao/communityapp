'use client';

// One-time bootstrap prompt for the password vault.
//
// Shown when a user with passwordsAccess has not yet derived their
// vault identity key. Triggers a CDP signature → derives an X25519
// keypair → publishes the pubkey. After that, the vault unlocks.

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react';

interface VaultBootstrapPromptProps {
  bootstrap: () => Promise<void>;
  error: string | null;
  isLoading?: boolean;
}

export function VaultBootstrapPrompt({
  bootstrap,
  error,
  isLoading,
}: VaultBootstrapPromptProps) {
  const [working, setWorking] = useState(false);

  const onClick = async () => {
    setWorking(true);
    try {
      await bootstrap();
    } finally {
      setWorking(false);
    }
  };

  const busy = working || isLoading;

  return (
    <Card className="p-6 space-y-4 border-2" style={{ borderColor: '#1F453A' }}>
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: '#E8F1EE' }}
        >
          <KeyRound className="h-5 w-5" style={{ color: '#1F453A' }} />
        </div>
        <div>
          <h3 className="font-semibold text-lg" style={{ color: '#1F453A' }}>
            Set up vault access
          </h3>
          <p className="text-sm mt-1" style={{ color: '#5F5A54' }}>
            To read or store credentials in this pod's vault, your wallet
            needs to derive an encryption key. You'll sign a single
            message — no transaction, no gas. The signature stays in your
            browser and is used to derive a key that only you hold.
          </p>
        </div>
      </div>

      <div
        className="rounded-lg p-3 text-xs flex items-start gap-2"
        style={{ backgroundColor: '#F4F1EC', color: '#5F5A54' }}
      >
        <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          The server stores encrypted blobs only. SpiritDAO operators
          cannot decrypt your pod's passwords even with database access.
          End-to-end encryption depends on the integrity of the wallet
          provider (Coinbase) — your wallet's signature is the root of
          trust.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg p-3 text-xs flex items-start gap-2"
          style={{ backgroundColor: '#FBEAEA', color: '#7A2E2E' }}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div>
        <Button onClick={onClick} disabled={busy}>
          {busy ? 'Setting up…' : 'Set up vault access'}
        </Button>
      </div>
    </Card>
  );
}
