// src/components/TransactionWrapper.tsx

import React, { ReactNode } from 'react';
import TransactionProvider from 'src/transaction/components/TransactionProvider';
import TransactionButton from 'src/transaction/components/TransactionButton';
import TransactionStatus from 'src/transaction/components/TransactionStatus';

type Props = {
  children?: ReactNode;
};

const TransactionWrapper = ({ children }: Props) => {
  return (
    <TransactionProvider>
      {children}
      <div>
        <TransactionButton />
        <TransactionStatus />
      </div>
    </TransactionProvider>
  );
};

export default TransactionWrapper;
