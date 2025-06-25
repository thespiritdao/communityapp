import { cn, color, text } from '../../styles/theme';
import type { TransactionSponsorReact } from '../types';
import { useTransactionContext } from './TransactionProvider';


console.log('[TransactionSponsor] paymasterUrl:', paymasterUrl, 'lifecycleStatus:', lifecycleStatus, 'error:', errorMessage, 'txInProgress:', transactionInProgress, 'receipt:', receipt);

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
  if (
    lifecycleStatus.statusName !== 'init' ||
    !paymasterUrl ||
    errorMessage ||
    transactionInProgress ||
    receipt
  ) {
    return null;
  }

  return (
    <div className={cn(text.label2, 'flex', className)}>
      <p className={color.foregroundMuted}>Zero transaction fee</p>
    </div>
  );
}
