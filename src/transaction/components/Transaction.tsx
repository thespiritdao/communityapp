// src/transaction/components/Transaction.tsx

import { cn } from '../../styles/theme';
import { useIsMounted } from '../../useIsMounted';
import { useOnchainKit } from '../../useOnchainKit';
import { useTheme } from '../../useTheme';
import type { TransactionReact } from '../types';
import { TransactionProvider } from './TransactionProvider';

const Transaction = ({
  calls,
  capabilities,
  chainId,
  className,
  children,
  contracts,
  isSponsored,
  onError,
  onStatus,
  onSuccess,
  address,
}: TransactionReact) => {
  const isMounted = useIsMounted();
  const componentTheme = useTheme();
  const { chain } = useOnchainKit();

  // Prevent SSR hydration issue
  if (!isMounted) {
    return null;
  }

  // If chainId is not provided, use the default chainId from the OnchainKit context
  const accountChainId = chainId ? chainId : chain.id;

  // Ensure address is properly formatted for paymaster transactions
  const formattedAddress = address?.toLowerCase() as `0x${string}`;

  return (
    <TransactionProvider
      calls={calls}
      capabilities={capabilities}
      chainId={accountChainId}
      isSponsored={isSponsored}
      contracts={contracts}
      onError={onError}
      onStatus={onStatus}
      onSuccess={onSuccess}
      address={formattedAddress}
    >
      <div
        className={cn(componentTheme, 'flex w-full flex-col gap-2', className)}
      >
        {children}
      </div>
    </TransactionProvider>
  );
};

export default Transaction;
