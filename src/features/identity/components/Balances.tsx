import { useTokenBalances } from '@/context/TokenBalancesContext';

export function Balances() {
  const { balances } = useTokenBalances();

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
