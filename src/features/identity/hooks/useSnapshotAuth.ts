import { useAccount, useSignMessage } from 'wagmi';

export const useSnapshotAuth = () => {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const signSnapshotMessage = async (message: string) => {
    const signature = await signMessageAsync({ message });
    return { address, signature };
  };

  return { signSnapshotMessage };
};
