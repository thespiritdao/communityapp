'use client';

import React from 'react';
import { useAccount, useBalance } from '@coinbase/onchainkit';
import { TOKENS } from '../constants';

interface TokenBalanceProps {
  selectedToken: 'SELF' | 'SYSTEM' | null;
}

export function TokenBalance({ selectedToken }: TokenBalanceProps) {
  const { address } = useAccount();
  const { data: selfBalance, error: selfError } = useBalance({
    address,
    token: TOKENS.SELF,
  });

  const { data: systemBalance, error: systemError } = useBalance({
    address,
    token: TOKENS.SYSTEM,
  });

  React.useEffect(() => {
    if (selfError) console.error('Error fetching SELF balance:', selfError);
    if (systemError) console.error('Error fetching SYSTEM balance:', systemError);
  }, [selfError, systemError]);

  if (!selectedToken) return null;

  const balance = selectedToken === 'SELF' ? selfBalance : systemBalance;
  const error = selectedToken === 'SELF' ? selfError : systemError;

  return (
    <div className="p-4 bg-gray-50 rounded-lg mb-4">
      <h3 className="text-lg font-semibold mb-2">Your Balance</h3>
      <div className="flex justify-between items-center">
        <span className="text-gray-600">{selectedToken} Token Balance:</span>
        <span className="font-semibold">
          {error ? (
            <span className="text-red-500">Error loading balance</span>
          ) : balance ? (
            `${Number(balance.formatted).toFixed(4)} ${selectedToken}`
          ) : (
            'Loading...'
          )}
        </span>
      </div>
    </div>
  );
}