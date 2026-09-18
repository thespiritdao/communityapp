// src/features/conference/hooks/useParticipantName.ts

import { useState, useEffect } from 'react';
import { fetchParticipantName } from '../services/participantName';

export function useParticipantName(walletAddress: string | null | undefined): string {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!walletAddress) return;
    const w = walletAddress.toLowerCase();
    fetchParticipantName(w)
      .then((resolved) => {
        if (resolved) setName(resolved);
        else setName(`${w.slice(0, 6)}…${w.slice(-4)}`);
      })
      .catch(() => setName(`${w.slice(0, 6)}…${w.slice(-4)}`));
  }, [walletAddress]);

  if (!walletAddress) return '';
  const w = walletAddress.toLowerCase();
  return name || `${w.slice(0, 6)}…${w.slice(-4)}`;
}
