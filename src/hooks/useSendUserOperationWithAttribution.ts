// src/hooks/useSendUserOperationWithAttribution.ts
//
// Drop-in replacement for useSendUserOperation from @coinbase/cdp-hooks.
// Passes ERC-8021 dataSuffix as a top-level param to sendUserOperation so
// the CDP SDK appends it to the outer UserOperation callData — the correct
// location for Base builder code attribution indexing.
//
// Builder Code: bc_hqymcgxs
// Suffix format: [0x0b][ASCII "bc_hqymcgxs"][0x00 schema][16-byte ERC marker]
// Encoded: 0x0b62635f6871796d636778730080218021802180218021802180218021

import { useSendUserOperation } from '@coinbase/cdp-hooks';

const ATTRIBUTION_SUFFIX = '0x0b62635f6871796d636778730080218021802180218021802180218021';

export function useSendUserOperationWithAttribution() {
  const { sendUserOperation, ...rest } = useSendUserOperation();

  const sendUserOperationWithAttribution: typeof sendUserOperation = (params) => {
    return sendUserOperation({
      ...params,
      dataSuffix: ATTRIBUTION_SUFFIX,
    } as any);
  };

  return { sendUserOperation: sendUserOperationWithAttribution, ...rest };
}
