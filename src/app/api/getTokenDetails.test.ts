import { type Mock, describe, expect, it, vi } from 'vitest';
import { CDP_GET_TOKEN_DETAILS } from 'src/network/definitions/nft';
import { sendRequest } from 'src/network/request';
import { getTokenDetails } from './getTokenDetails';
import type { GetTokenDetailsParams } from './types';

vi.mock('src/network/request', () => ({
  sendRequest: vi.fn(),
}));

describe('getTokenDetails', () => {
  const mockSendRequest = sendRequest as Mock;

  const params: GetTokenDetailsParams = {
    contractAddress: '0x123',
    tokenId: '1',
  };

  it('should return token details when request is successful', async () => {
    const mockResponse = {
      result: {
        name: 'NFT Name',
        description: 'NFT Description',
        imageUrl: 'https://nft-image-url.com',
        animationUrl: 'https://nft-animation-url.com',
        mimeType: 'image/png',
        ownerAddress: '0x123',
        lastSoldPrice: {
          amount: '1',
          currency: 'ETH',
          amountUSD: '2000',
        },
        contractType: 'ERC721',
      },
    };

    mockSendRequest.mockResolvedValueOnce(mockResponse);

    const result = await getTokenDetails(params);

    expect(result).toEqual(mockResponse.result);
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_GET_TOKEN_DETAILS, [
      params,
    ]);
  });

  it('should return error details when request fails with an error', async () => {
    const mockErrorResponse = {
      error: {
        code: '404',
        message: 'Not Found',
      },
    };

    mockSendRequest.mockResolvedValueOnce(mockErrorResponse);

    const result = await getTokenDetails(params);

    expect(result).toEqual({
      code: '404',
      error: 'Error fetching token details',
      message: 'Not Found',
    });
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_GET_TOKEN_DETAILS, [
      params,
    ]);
  });

  it('should return uncaught error details when an exception is thrown', async () => {
    mockSendRequest.mockRejectedValue(new Error('Network Error'));

    const result = await getTokenDetails(params);

    expect(result).toEqual({
      code: 'uncaught-nft',
      error: 'Something went wrong',
      message: 'Error fetching token details',
    });
    expect(mockSendRequest).toHaveBeenCalledWith(CDP_GET_TOKEN_DETAILS, [
      params,
    ]);
  });
});
