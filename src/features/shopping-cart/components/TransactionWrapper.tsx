'use client';

import type { ReactNode } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';

// CDP-native types (simplified from OnchainKit types)
type CDPTransactionError = {
  message: string;
  name: string;
  stack?: string;
};

type CDPTransactionResponse = {
  userOperationHash?: string;
  [key: string]: any;
};

type TransactionWrapperChildren = {
  address: string | undefined;
  onError: (error: CDPTransactionError) => void;
  onSuccess: (response: CDPTransactionResponse) => void;
};

type TransactionWrapperReact = {
  children: (props: TransactionWrapperChildren) => ReactNode;
};

export default function TransactionWrapper({
  children,
}: TransactionWrapperReact) {
  const { currentUser } = useCurrentUser();

  // Get address from CDP Smart Account (not EOA)
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  function onError(error: CDPTransactionError) {
    console.error('TransactionWrapper.onError:', error);
  }

  function onSuccess(response: CDPTransactionResponse) {
    console.log('TransactionWrapper.onSuccess', response);
  }

  return (
    <div className="transaction-wrapper">
      {children({
        address,
        onError,
        onSuccess,
      })}
    </div>
  );
}
