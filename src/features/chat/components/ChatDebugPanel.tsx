// src/features/chat/components/ChatDebugPanel.tsx
'use client';

import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { usePodModules } from '@/features/pods/hooks/usePodModules';
import { useState } from 'react';

export function ChatDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { userHats, userRoles, permissions } = useHatPermissions();
  const { balances, refreshBalances, isLoading } = useTokenBalances();
  const { modules } = usePodModules();

  const handleRefresh = async () => {
    console.log('🔄 Manually refreshing balances...');
    await refreshBalances();
    console.log('✅ Balances refreshed');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 16px',
          background: '#8FAAA1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
      >
        🐛 Debug Chat
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        zIndex: 9999,
        maxWidth: '90vw',
        width: '400px',
        maxHeight: '70vh',
        overflow: 'auto',
        background: 'white',
        border: '2px solid #8FAAA1',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>🐛 Chat Debug Info</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            style={{
              background: isLoading ? '#9ca3af' : '#8FAAA1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '12px',
            }}
          >
            {isLoading ? '...' : '🔄 Refresh'}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#8FAAA1', display: 'block', marginBottom: '4px' }}>User HATs ({userHats?.length || 0}):</strong>
        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', wordBreak: 'break-all' }}>
          {userHats && userHats.length > 0 ? (
            userHats.map((hat, i) => (
              <div key={i} style={{ marginBottom: '4px', fontSize: '10px' }}>
                {i + 1}. {String(hat).slice(0, 20)}...
              </div>
            ))
          ) : (
            <div style={{ color: '#6b7280' }}>No HATs found</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#8FAAA1', display: 'block', marginBottom: '4px' }}>User Roles ({userRoles?.length || 0}):</strong>
        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px' }}>
          {userRoles && userRoles.length > 0 ? (
            userRoles.map((role, i) => (
              <div key={i} style={{ marginBottom: '8px', fontSize: '11px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
                <div style={{ fontWeight: 'bold' }}>{role.name}</div>
                <div style={{ color: '#6b7280', fontSize: '10px' }}>
                  HAT: {String(role.hatId).slice(0, 15)}...
                </div>
                <div style={{ color: '#059669', fontSize: '10px' }}>
                  Chat: {role.permissions?.chatAccess ? '✅' : '❌'}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: '#6b7280' }}>No roles found</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#8FAAA1', display: 'block', marginBottom: '4px' }}>Token Balances:</strong>
        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', fontSize: '11px' }}>
          <div>PoC: {balances?.hasProofOfCuriosity ? '✅' : '❌'}</div>
          <div>Beta Tester HAT: {(balances as any)?.hasBetaTesterHat ? '✅' : '❌'}</div>
          <div>Advocate: {(balances as any)?.hasAdvocate ? '✅' : '❌'}</div>
          <div>Exec Pod: {balances?.hasExecutivePod ? '✅' : '❌'}</div>
          <div>Dev Pod: {balances?.hasDevPod ? '✅' : '❌'}</div>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#8FAAA1', display: 'block', marginBottom: '4px' }}>Pod Modules ({Object.keys(modules).length}):</strong>
        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', fontSize: '11px' }}>
          {Object.keys(modules).length > 0 ? (
            Object.entries(modules).map(([podId, config]: [string, any]) => (
              <div key={podId} style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>
                  {podId.slice(0, 8)}... Chat: {config?.chat_enabled ? '✅' : '❌'}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: '#6b7280' }}>No modules loaded</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#8FAAA1', display: 'block', marginBottom: '4px' }}>Environment:</strong>
        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', fontSize: '10px', wordBreak: 'break-all' }}>
          <div>Beta Tester HAT: {process.env.NEXT_PUBLIC_BETA_TESTER_HAT?.slice(0, 20)}...</div>
          <div>Advocate: {process.env.NEXT_PUBLIC_ADVOCATE?.slice(0, 20)}...</div>
          <div>PoC: {process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY?.slice(0, 20)}...</div>
        </div>
      </div>

      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '12px', padding: '8px', background: '#fef3c7', borderRadius: '4px' }}>
        ⚠️ This panel helps debug why certain chats don't appear. Check if balances/roles match what you expect.
      </div>
    </div>
  );
}
