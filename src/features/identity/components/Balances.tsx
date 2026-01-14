import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useEffect } from 'react';

export function Balances() {
  console.log('🔵 [Balances] Component MOUNTING');

  const { balances, isLoading, error } = useTokenBalances();

  console.log('🔵 [Balances] Hook returned:', {
    hasBalances: !!balances,
    balances: balances,
    isLoading,
    error: error?.message,
  });

  // Debug logging for mobile display issue
  useEffect(() => {
    console.log('💰 [Balances] Component Render (useEffect):', {
      hasBalances: !!balances,
      selfBalance: balances?.selfBalance,
      systemBalance: balances?.systemBalance,
      isLoading,
      error: error?.message,
      timestamp: new Date().toISOString(),
    });

    // Force log the raw balances object
    console.log('💰 [Balances] RAW balances object:', balances);
  }, [balances, isLoading, error]);

  if (isLoading) {
    console.log('⏳ [Balances] Showing loading state');
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
        Loading balances...
      </div>
    );
  }

  if (error) {
    console.error('❌ [Balances] Error state:', error);
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#ff0000' }}>
        Error loading balances: {error.message}
      </div>
    );
  }

  console.log('✅ [Balances] Rendering balances:', {
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
    </div>
  );
}
