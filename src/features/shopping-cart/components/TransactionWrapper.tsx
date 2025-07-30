'use client';

import React, { ReactNode } from 'react';
import { useAccount } from 'wagmi';
import type { LifecycleStatus, TransactionError, TransactionResponse } from '@coinbase/onchainkit/transaction';

type TransactionWrapperChildren = {
  address: string | undefined;
  onError: (error: TransactionError) => void;
  onSuccess: (response: TransactionResponse) => void;
  onStatus: (status: LifecycleStatus) => void;
};

type TransactionWrapperReact = {
  children: (props: TransactionWrapperChildren) => ReactNode;
};

export default function TransactionWrapper({
  children,
}: TransactionWrapperReact) {
  const { address } = useAccount();

  function onError(error: TransactionError) {
    console.error('TransactionWrapper.onError:', error);
  }

  function onSuccess(response: TransactionResponse) {
    console.log('TransactionWrapper.onSuccess', response);
  }

  function onStatus(status: LifecycleStatus) {
    console.log('TransactionWrapper.onStatus', status);
  }

  return (
    <div className="transaction-wrapper">
      {children({ 
        address, 
        onError, 
        onSuccess, 
        onStatus 
      })}
    </div>
  );
} 