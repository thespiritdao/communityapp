import { CDP_GET_SWAP_QUOTE } from 'src/network/definitions/swap';
import { sendRequest } from 'src/network/request';
import type { SwapQuote } from '../swap/types';
import { getSwapErrorCode } from '../swap/utils/getSwapErrorCode';
import type {
  APIError,
  GetSwapQuoteParams,
  GetSwapQuoteResponse,
  SwapAPIParams,
} from './types';
import { getAPIParamsForToken } from './utils/getAPIParamsForToken';

/**
 * Retrieves a quote for a swap from Token A to Token B.
 */
export async function getSwapQuote(
  params: GetSwapQuoteParams,
): Promise<GetSwapQuoteResponse> {
  // Default parameters
  const defaultParams = {
    amountReference: 'from',
    isAmountInDecimals: false,
  };
  const apiParamsOrError = getAPIParamsForToken({
    ...defaultParams,
    ...params,
  });
  if ((apiParamsOrError as APIError).error) {
    return apiParamsOrError as APIError;
  }
  let apiParams = apiParamsOrError as SwapAPIParams;

  if (!params.useAggregator) {
    apiParams = {
      v2Enabled: true,
      ...apiParams,
    };
  }
  if (params.maxSlippage) {
    let slippagePercentage = params.maxSlippage;
    // Adjust slippage for V1 API (aggregator)
    // V1 expects slippage in tenths of a percent (e.g., 30 = 3%)
    if (params.useAggregator) {
      slippagePercentage = (Number(params.maxSlippage) * 10).toString();
    }
    apiParams = {
      slippagePercentage: slippagePercentage,
      ...apiParams,
    };
  }

  try {
    const res = await sendRequest<SwapAPIParams, SwapQuote>(
      CDP_GET_SWAP_QUOTE,
      [apiParams],
    );
    if (res.error) {
      return {
        code: getSwapErrorCode('quote', res.error?.code),
        error: res.error.message,
        message: '',
      };
    }
    return res.result;
  } catch (_error) {
    return {
      code: getSwapErrorCode('uncaught-quote'),
      error: 'Something went wrong',
      message: '',
    };
  }
}
