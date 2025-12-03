import type { Address } from 'viem';
import Transaction from './Transaction';
import { TransactionButton } from './TransactionButton';
import { TransactionStatus } from './TransactionStatus';
import { TransactionStatusLabel } from './TransactionStatusLabel';
import { TransactionStatusAction } from './TransactionStatusAction';

type TransactionWrapperProps = {
  address: Address;
  contracts: any; // Replace with your proper type
  handleError: (error: any) => void;
  handleSuccess: (result: any) => void;
};

const TransactionWrapper = ({
  address,
  contracts,
  handleError,
  handleSuccess,
}: TransactionWrapperProps) => {
  // Convert the NEXT_PUBLIC_CHAIN_ID from string to number
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID
    ? Number(process.env.NEXT_PUBLIC_CHAIN_ID)
    : undefined;

  return (
    <Transaction
      isSponsored={true}
      address={address}
      contracts={contracts}
      className="w-[450px]"
      chainId={chainId}
      onError={handleError}
      onSuccess={handleSuccess}
    >
      <TransactionButton
        className="mt-0 mr-auto ml-auto w-[450px] max-w-full text-[white]"
        text="Collect"
      />
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
};

export default TransactionWrapper;
