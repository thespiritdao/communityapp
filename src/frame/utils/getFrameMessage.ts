import {
  NEYNAR_DEFAULT_API_KEY,
  neynarFrameValidation,
} from '../../network/neynar/neynarFrameValidation';
import type {
  FrameRequest,
  FrameValidationResponse,
  MockFrameRequest,
} from '../types';

type FrameMessageOptions =
  | {
      neynarApiKey?: string;
      castReactionContext?: boolean;
      followContext?: boolean;
      allowFramegear?: boolean;
    }
  | undefined;

/**
 * Given a frame message, decode and validate it.
 * If message is valid, return the message. Otherwise undefined.
 */
async function getFrameMessage(
  body: FrameRequest | MockFrameRequest,
  messageOptions?: FrameMessageOptions,
): Promise<FrameValidationResponse> {
  // Skip validation only when allowed and when receiving a request from framegear
  if (messageOptions?.allowFramegear) {
    if ((body as MockFrameRequest).mockFrameData) {
      return {
        isValid: true,
        message: (body as MockFrameRequest).mockFrameData,
      };
    }
  }

  // Validate the message
  const response = await neynarFrameValidation(
    body?.trustedData?.messageBytes,
    messageOptions?.neynarApiKey || NEYNAR_DEFAULT_API_KEY,
    messageOptions?.castReactionContext || true,
    messageOptions?.followContext || true,
  );
  if (response?.valid) {
    return {
      isValid: true,
      message: response,
    };
  }
  // Security best practice, don't return anything if we can't validate the frame.
  return {
    isValid: false,
    message: undefined,
  };
}

export { getFrameMessage };
