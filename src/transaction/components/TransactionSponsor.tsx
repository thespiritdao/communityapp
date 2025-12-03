import { cn, text } from '../../styles/theme';
import type { TransactionSponsorReact } from '../types';
import { useTransactionContext } from './TransactionProvider';

export function TransactionSponsor({ className }: TransactionSponsorReact) {
  const {
    errorMessage,
    lifecycleStatus,
    paymasterUrl,
    receipt,
    transactionHash,
    transactionId,
  } = useTransactionContext();

  const transactionInProgress = transactionId || transactionHash;

  console.log(
    '[TransactionSponsor] paymasterUrl:',
    paymasterUrl,
    'lifecycleStatus:',
    lifecycleStatus,
    'error:',
    errorMessage,
    'txInProgress:',
    transactionInProgress,
    'receipt:',
    receipt,
  );
  if (
    lifecycleStatus.statusName !== 'init' ||
    !paymasterUrl ||
    errorMessage ||
    transactionInProgress ||
    receipt
  ) {
    return null;
  }

  return <div className={cn(text.label2, 'flex', className)}></div>;
}
