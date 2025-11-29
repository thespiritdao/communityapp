'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';

// Safe wrapper for OnchainKit components that handles import errors gracefully
export const SafeOnchainKitWrapper: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}> = ({
  children,
  fallback = <Button disabled={true}>Loading...</Button>,
  errorFallback = (
    <Button disabled={true} variant="outline">
      Transaction unavailable
    </Button>
  ),
}) => {
  return (
    <Suspense fallback={fallback}>
      <ErrorBoundary fallback={errorFallback}>{children}</ErrorBoundary>
    </Suspense>
  );
};

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('OnchainKit component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Safe dynamic imports for OnchainKit components
export const SafeTransaction = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.Transaction,
      }))
      .catch(() => ({
        default: (props: any) => (
          <div className="text-red-500 p-4 border border-red-200 rounded">
            Transaction component failed to load
            {props.children}
          </div>
        ),
      })),
  {
    ssr: false,
    loading: () => <Button disabled={true}>Loading transaction...</Button>,
  },
);

export const SafeTransactionButton = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.TransactionButton,
      }))
      .catch(() => ({
        default: (props: any) => (
          <Button disabled={true} variant="outline" className={props.className}>
            {props.text || 'Transaction Unavailable'}
          </Button>
        ),
      })),
  {
    ssr: false,
    loading: () => <Button disabled={true}>Loading...</Button>,
  },
);

export const SafeTransactionSponsor = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.TransactionSponsor,
      }))
      .catch(() => ({
        default: () => (
          <div className="text-xs text-gray-500">Sponsor unavailable</div>
        ),
      })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-gray-400">Loading sponsor...</div>
    ),
  },
);

export const SafeTransactionStatus = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.TransactionStatus,
      }))
      .catch(() => ({
        default: (props: any) => (
          <div className="text-sm text-gray-500">Status unavailable</div>
        ),
      })),
  {
    ssr: false,
    loading: () => (
      <div className="text-sm text-gray-400">Loading status...</div>
    ),
  },
);

export const SafeTransactionStatusLabel = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.TransactionStatusLabel,
      }))
      .catch(() => ({
        default: () => (
          <span className="text-sm text-gray-500">Status: Unknown</span>
        ),
      })),
  {
    ssr: false,
    loading: () => <span className="text-sm text-gray-400">Loading...</span>,
  },
);

export const SafeTransactionStatusAction = dynamic(
  () =>
    import('@coinbase/onchainkit/transaction')
      .then((mod) => ({
        default: mod.TransactionStatusAction,
      }))
      .catch(() => ({
        default: () => (
          <Button disabled={true} size="sm">
            Action unavailable
          </Button>
        ),
      })),
  {
    ssr: false,
    loading: () => (
      <Button disabled={true} size="sm">
        Loading...
      </Button>
    ),
  },
);
