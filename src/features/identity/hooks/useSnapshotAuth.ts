import { useEvmAddress, useSignEvmMessage, useCurrentUser } from '@coinbase/cdp-hooks';

export const useSnapshotAuth = () => {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();

  const signSnapshotMessage = async (message: string) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const evmAccount = currentUser?.evmAccounts?.[0]?.address;
    if (!evmAccount) {
      throw new Error('EVM account not available');
    }

    const result = await signEvmMessage({
      evmAccount: evmAccount as `0x${string}`,
      message,
    });

    return { address, signature: result.signature };
  };

  return { signSnapshotMessage };
};
