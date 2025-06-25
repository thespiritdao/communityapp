'use client';

import React from 'react';

interface TransactionStatusProps {
  isPending: boolean;
  error: string | null;
  hash: string | null;
  onClose: () => void;
}

export function TransactionStatus({ isPending, error, hash, onClose }: TransactionStatusProps) {
  if (!isPending && !error && !hash) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        {isPending && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold mb-2">Processing Transaction</h3>
            <p className="text-gray-600">Please wait while we process your transaction...</p>
          </div>
        )}

        {error && (
          <div className="text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold mb-2">Transaction Failed</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Close
            </button>
          </div>
        )}

        {hash && !isPending && !error && (
          <div className="text-center">
            <div className="text-green-500 text-4xl mb-4">✓</div>
            <h3 className="text-xl font-semibold mb-2">Transaction Successful</h3>
            <p className="text-gray-600 mb-2">Transaction Hash:</p>
            <a
              href={`https://basescan.org/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline break-all block mb-4"
            >
              {hash}
            </a>
            <button
              onClick={onClose}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 