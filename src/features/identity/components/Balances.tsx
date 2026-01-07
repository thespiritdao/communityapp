import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useEffect } from 'react';

export function Balances() {
  const { balances, isLoading } = useTokenBalances();

  // Debug logging for mobile display issue
  useEffect(() => {
    console.log('💰 Balances Component Render:', {
      hasBalances: !!balances,
      selfBalance: balances?.selfBalance,
      systemBalance: balances?.systemBalance,
      isLoading,
      timestamp: new Date().toISOString(),
    });
  }, [balances, isLoading]);

  if (isLoading) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
        Loading balances...
      </div>
    );
  }

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
