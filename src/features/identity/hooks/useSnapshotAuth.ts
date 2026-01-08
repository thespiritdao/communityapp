import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useSignMessage } from 'wagmi';

export const useSnapshotAuth = () => {
  const { evmAddress: address } = useEvmAddress();
  const { signMessageAsync } = useSignMessage();

  const signSnapshotMessage = async (message: string) => {
    const signature = await signMessageAsync({ message });
    return { address, signature };
  };

  return { signSnapshotMessage };
};
