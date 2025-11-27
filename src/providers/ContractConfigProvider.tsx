'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { validateContractAddresses } from '@/config/contracts';

interface ContractConfigState {
  isValid: boolean;
  missing: string[];
  warnings: string[];
  isLoading: boolean;
}

const ContractConfigContext = createContext<ContractConfigState>({
  isValid: true,
  missing: [],
  warnings: [],
  isLoading: true,
});

export function ContractConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContractConfigState>({
    isValid: true,
    missing: [],
    warnings: [],
    isLoading: true,
  });

  useEffect(() => {
    const result = validateContractAddresses();

    if (!result.isValid) {
      console.error('❌ Missing required contract addresses:', result.missing);
    }

    if (result.warnings.length > 0) {
      console.warn('⚠️ Contract configuration warnings:', result.warnings);
    }

    setState({
      isValid: result.isValid,
      missing: result.missing,
      warnings: result.warnings,
      isLoading: false,
    });
  }, []);

  // Show error UI if critical addresses missing
  if (!state.isLoading && !state.isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md" style={{ borderWidth: 1, borderColor: '#FCA5A5' }}>
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#DC2626"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-bold mb-4" style={{ color: '#DC2626' }}>
            Configuration Error
          </h2>

          <p className="mb-4" style={{ color: '#374151' }}>
            Required contract addresses are missing from your environment configuration:
          </p>

          <ul className="text-left list-disc list-inside mb-6 text-sm" style={{
            color: '#6B7280',
            backgroundColor: '#F9FAFB',
            padding: '1rem',
            borderRadius: '0.5rem'
          }}>
            {state.missing.map((addr) => (
              <li key={addr} className="font-mono">{addr}</li>
            ))}
          </ul>

          <div style={{
            backgroundColor: '#FEF3C7',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem'
          }}>
            <p className="text-xs" style={{ color: '#92400E' }}>
              <strong>💡 Fix:</strong> Add the missing addresses to your <code>.env</code> file
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded font-medium"
            style={{
              backgroundColor: '#2F5D50',
              color: 'white'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show warnings in console but don't block app
  if (!state.isLoading && state.warnings.length > 0) {
    // Warnings already logged in useEffect
  }

  return (
    <ContractConfigContext.Provider value={state}>
      {children}
    </ContractConfigContext.Provider>
  );
}

export const useContractConfig = () => useContext(ContractConfigContext);
