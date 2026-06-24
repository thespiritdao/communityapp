import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useEffect } from 'react';

export function Balances() {
  console.error('[DEBUG] 🔵 [Balances] Component MOUNTING');

  // `balances.selfBalance` is now the V2 decayed (spendable) $SELF — resolved
  // at the source in fetchTokenBalances via /api/self/holdings, so every
  // consumer (this, the market top bar, cart, eligibility) is consistent.
  const { balances, isLoading, error } = useTokenBalances();

  console.error('[DEBUG] 🔵 [Balances] Hook returned:', {
    hasBalances: !!balances,
    balances: balances,
    isLoading,
    error: error?.message,
  });

  // Debug logging for mobile display issue
  useEffect(() => {
    console.error('[DEBUG] 💰 [Balances] Component Render (useEffect):', {
      hasBalances: !!balances,
      selfBalance: balances?.selfBalance,
      systemBalance: balances?.systemBalance,
      isLoading,
      error: error?.message,
      timestamp: new Date().toISOString(),
    });

    // Force log the raw balances object
    console.error('[DEBUG] 💰 [Balances] RAW balances object:', balances);
  }, [balances, isLoading, error]);

  if (isLoading) {
    console.error('[DEBUG] ⏳ [Balances] Showing loading state');
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
        Loading balances...
      </div>
    );
  }

  if (error) {
    console.error('[ERROR] ❌ [Balances] Error state:', error);
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#ff0000' }}>
        Error loading balances: {error.message}
      </div>
    );
  }

  console.error('[DEBUG] ✅ [Balances] Rendering balances:', {
    self: balances?.selfBalance || '0',
    system: balances?.systemBalance || '0',
  });

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <label
          style={{ fontWeight: 'bold', marginRight: '8px', color: '#5ba3f4' }}
        >
          $SELF:
        </label>
        <span>{balances?.selfBalance || '0'}</span>
      </div>
      <div>
        <label
          style={{ fontWeight: 'bold', marginRight: '8px', color: '#0aba42' }}
        >
          $SYSTEM:
        </label>
        <span>{balances?.systemBalance || '0'}</span>
      </div>
      {/* Custom community tokens the wallet holds (>0). Plain text, no badge —
          $SELF/$SYSTEM above always stay pinned on top. */}
      {balances?.customTokens?.map((t) => (
        <div key={t.address} style={{ marginTop: '10px' }}>
          <label
            style={{ fontWeight: 'bold', marginRight: '8px', color: '#6b7280' }}
          >
            {t.symbol}:
          </label>
          <span>{t.balance}</span>
        </div>
      ))}
    </div>
  );
}
