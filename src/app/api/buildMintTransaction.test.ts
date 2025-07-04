import { type Mock, describe, expect, it, vi } from 'vitest';
import { CDP_MINT_TOKEN } from 'src/network/definitions/nft';
import { sendRequest } from 'src/network/request';
import { buildMintTransaction } from './buildMintTransaction';
import type { BuildMintTransactionParams } from './types';

vi.mock('src/network/request', () => ({
  sendRequest: vi.fn(),
}));

describe('buildMintTransaction', () => {
  const mockSendRequest = sendRequest as Mock;

  const params: BuildMintTransactionParams = {
    mintAddress: '0x123',
    network: 'networks/base-mainnet',
    quantity: 1,
    takerAddress: '0x456',
  };

  it('should return call data when request is successful', async () => {
    const mockResponse = {
      result: {
        callData: {
          to: '0x123',
          from: '0x456',
          data: '0x789',
          value: '1',
        },
      },
    };

    mockSendRequest.mockResolvedValueOnce(mockResponse);

    const result = await buildMintTransaction(params);

    expect(result).toEqual(mockResponse.result);
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_MINT_TOKEN, [params]);
  });

  it('should return error details when request fails with an error', async () => {
    const mockErrorResponse = {
      error: {
        code: '404',
        message: 'Not Found',
      },
    };

    mockSendRequest.mockResolvedValueOnce(mockErrorResponse);

    const result = await buildMintTransaction(params);

    expect(result).toEqual({
      code: '404',
      error: 'Error building mint transaction',
      message: 'Not Found',
    });
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_MINT_TOKEN, [params]);
  });

  it('should return uncaught error details when an exception is thrown', async () => {
    mockSendRequest.mockRejectedValue(new Error('Network Error'));

    const result = await buildMintTransaction(params);

    expect(result).toEqual({
      code: 'uncaught-nft',
      error: 'Something went wrong',
      message: 'Error building mint transaction',
    });
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_MINT_TOKEN, [params]);
  });
});
