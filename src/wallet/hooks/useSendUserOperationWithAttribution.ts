// src/wallet/hooks/useSendUserOperationWithAttribution.ts
//
// Drop-in replacement for useSendUserOperation from @coinbase/cdp-hooks.
// Appends the SpiritDAO Builder Code suffix (ERC-8021) to every call's data
// field so transactions are attributed to our app on base.dev.
//
// Builder Code: bc_hqymcgxs
// Encoded suffix: 0x62635f6871796d636778730b0080218021802180218021802180218021
//
// Usage: replace `useSendUserOperation` imports with this hook — API is identical.

import { useSendUserOperation } from '@coinbase/cdp-hooks';

const ATTRIBUTION_SUFFIX = '0x62635f6871796d636778730b0080218021802180218021802180218021' as `0x${string}`;

function appendSuffix(data: `0x${string}` | undefined): `0x${string}` {
  if (!data || data === '0x') return ATTRIBUTION_SUFFIX;
  return (data + ATTRIBUTION_SUFFIX.slice(2)) as `0x${string}`;
}

export function useSendUserOperationWithAttribution() {
  const { sendUserOperation, ...rest } = useSendUserOperation();

  const sendUserOperationWithAttribution: typeof sendUserOperation = (params) => {
    const patchedCalls = params.calls?.map((call) => ({
      ...call,
      data: appendSuffix(call.data as `0x${string}` | undefined),
    }));

    return sendUserOperation({
      ...params,
      calls: patchedCalls,
    });
  };

  return { sendUserOperation: sendUserOperationWithAttribution, ...rest };
}
