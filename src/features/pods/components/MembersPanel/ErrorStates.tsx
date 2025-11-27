/**
 * Error States - Preserves existing UX design language
 * 
 * Error components that match the existing blue/red theme and
 * card layout patterns used throughout the pod management interface.
 */

'use client';

import React from 'react';
import { AlertCircle, RefreshCw, Wifi, Server } from 'lucide-react';

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
  className?: string;
}

/**
 * Member loading error that matches existing card patterns
 */
export const MemberLoadingError = React.memo<ErrorStateProps>(({ 
  error, 
  onRetry, 
  className = "p-4 border rounded-lg" 
}) => {
  const isNetworkError = error.message.toLowerCase().includes('network') || 
                        error.message.toLowerCase().includes('fetch');
  
  const isRpcError = error.message.toLowerCase().includes('rpc') ||
                    error.message.toLowerCase().includes('rate limit');

  const getErrorMessage = () => {
    if (isNetworkError) {
      return 'Unable to load member data. Please check your connection.';
    }
    if (isRpcError) {
      return 'Blockchain network is busy. Please try again in a moment.';
    }
    return 'Failed to load member data. Please try again.';
  };

  const getIcon = () => {
    if (isNetworkError) return Wifi;
    if (isRpcError) return Server;
    return AlertCircle;
  };

  const Icon = getIcon();
  const isInfoError = isNetworkError || isRpcError;

  return (
    <div
      className={className}
      style={{
        backgroundColor: isInfoError ? '#E8F1EE' : '#F5E6E6',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: isInfoError ? '#B8D9CA' : '#D9B3B3',
        color: isInfoError ? '#1F453A' : '#5C1F1F'
      }}
    >
      <div className="flex items-center space-x-3">
        <Icon className="h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {getErrorMessage()}
          </p>
          {isRpcError && (
            <p className="text-xs mt-1 opacity-75">
              This usually resolves automatically within a few seconds.
            </p>
          )}
        </div>
        <button
          onClick={onRetry}
          className="text-white px-3 py-1 rounded text-sm transition-colors"
          style={{ backgroundColor: '#2F5D50' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1F453A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2F5D50';
          }}
        >
          <RefreshCw className="h-3 w-3 mr-1 inline" />
          Retry
        </button>
      </div>
    </div>
  );
});

MemberLoadingError.displayName = 'MemberLoadingError';

/**
 * Profile loading error with inline retry
 */
export const ProfileLoadingError = React.memo<{
  address: string;
  onRetry: () => void;
}>(({ address, onRetry }) => (
  <div className="flex items-center space-x-3 p-3 border rounded-lg" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5EDD9' }}>
      <AlertCircle className="h-5 w-5" style={{ color: '#C6933F' }} />
    </div>
    <div className="flex-1">
      <p className="font-medium" style={{ color: '#8F6B2F' }}>Profile unavailable</p>
      <p className="text-sm font-mono" style={{ color: '#A67E35' }}>
        {address.slice(0, 10)}...{address.slice(-8)}
      </p>
    </div>
    <button
      onClick={onRetry}
      className="p-1"
      style={{ color: '#A67E35' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#8F6B2F';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#A67E35';
      }}
      title="Retry loading profile"
    >
      <RefreshCw className="h-4 w-4" />
    </button>
  </div>
));

ProfileLoadingError.displayName = 'ProfileLoadingError';

/**
 * HAT query error that matches the INFO style
 */
export const HatQueryError = React.memo<ErrorStateProps>(({
  error,
  onRetry
}) => (
  <div className="p-3 border rounded-lg" style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
    <div className="flex items-center space-x-2 mb-2">
      <Server className="h-4 w-4" style={{ color: '#2F5D50' }} />
      <p className="text-sm font-medium" style={{ color: '#2F5D50' }}>
        HAT data temporarily unavailable
      </p>
    </div>
    <p className="text-xs mb-3" style={{ color: '#3F7A5A' }}>
      Unable to query HAT membership from blockchain. This may be due to network congestion.
    </p>
    <button
      onClick={onRetry}
      className="text-white px-3 py-1 rounded text-xs"
      style={{ backgroundColor: '#2F5D50' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#1F453A';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#2F5D50';
      }}
    >
      Check Again
    </button>
  </div>
));

HatQueryError.displayName = 'HatQueryError';

/**
 * Transaction error with existing styling
 */
export const TransactionError = React.memo<{
  error: Error;
  txHash?: string;
  onRetry?: () => void;
  onDismiss: () => void;
}>(({ error, txHash, onRetry, onDismiss }) => {
  const isUserRejection = error.message.toLowerCase().includes('user rejected') ||
                         error.message.toLowerCase().includes('user denied');

  return (
    <div
      className="p-4 border rounded-lg"
      style={{
        backgroundColor: isUserRejection ? '#FAF4EC' : '#F5E6E6',
        borderColor: isUserRejection ? '#E8D7B8' : '#D9B3B3',
        color: isUserRejection ? '#8F6B2F' : '#5C1F1F'
      }}
    >
      <div className="flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium">
            {isUserRejection ? 'Transaction Cancelled' : 'Transaction Failed'}
          </p>
          <p className="text-sm mt-1">
            {isUserRejection
              ? 'You cancelled the transaction in your wallet.'
              : 'The transaction could not be completed. Please try again.'
            }
          </p>
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-2 inline-block"
            >
              View on BaseScan
            </a>
          )}
        </div>
        <div className="flex space-x-2">
          {onRetry && !isUserRejection && (
            <button
              onClick={onRetry}
              className="text-white px-3 py-1 rounded text-sm"
              style={{ backgroundColor: '#2F5D50' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F453A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }}
            >
              Retry
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
});

TransactionError.displayName = 'TransactionError';