// src/hooks/useSendUserOperationWithAttribution.ts
//
// Drop-in replacement for useSendUserOperation from @coinbase/cdp-hooks.
// Passes an ERC-8021 dataSuffix as a top-level param to sendUserOperation so
// the CDP SDK appends it to the outer UserOperation callData, the location
// Base builder-code attribution indexing reads.
//
// The builder code comes from NEXT_PUBLIC_BUILDER_CODE (see
// src/config/deployment.ts). With no builder code configured, operations are
// sent unchanged.

import { useSendUserOperation } from '@coinbase/cdp-hooks';
import { BUILDER_CODE_USEROP_SUFFIX } from '@/config/deployment';

export function useSendUserOperationWithAttribution() {
  const { sendUserOperation, ...rest } = useSendUserOperation();

  const sendUserOperationWithAttribution: typeof sendUserOperation = (params) => {
    if (!BUILDER_CODE_USEROP_SUFFIX) return sendUserOperation(params);
    return sendUserOperation({
      ...params,
      dataSuffix: BUILDER_CODE_USEROP_SUFFIX,
    } as any);
  };

  return { sendUserOperation: sendUserOperationWithAttribution, ...rest };
}
