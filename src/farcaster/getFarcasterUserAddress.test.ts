import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCustodyAddressForFidNeynar } from '../network/neynar/getCustodyAddressForFidNeynar';
import { getVerifiedAddressesForFidNeynar } from '../network/neynar/getVerifiedAddressesForFidNeynar';
import { getFarcasterUserAddress } from './getFarcasterUserAddress';

vi.mock('../network/neynar/getCustodyAddressForFidNeynar');
vi.mock('../network/neynar/getVerifiedAddressesForFidNeynar');

describe('getFarcasterUserAddress function', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should return null if any API call fails', async () => {
    const error = new Error('Something went wrong');
    (getVerifiedAddressesForFidNeynar as Mock).mockRejectedValue(error);
    const result = await getFarcasterUserAddress(123);
    expect(result).toBeNull();
  });

  it('should return both custody and verified addresses by default', async () => {
    const expectedCustodyAddress = 'mock-custody-address';
    (getCustodyAddressForFidNeynar as Mock).mockResolvedValue(
      expectedCustodyAddress,
    );
    (getVerifiedAddressesForFidNeynar as Mock).mockResolvedValue([
      expectedCustodyAddress,
    ]);

    const result = await getFarcasterUserAddress(123);
    expect(result).toEqual({
      custodyAddress: expectedCustodyAddress,
      verifiedAddresses: [expectedCustodyAddress],
    });
  });

  it('should return null if both hasCustodyAddress and hasVerifiedAddresses are false', async () => {
    const result = await getFarcasterUserAddress(123, {
      hasCustodyAddress: false,
      hasVerifiedAddresses: false,
    });
    expect(result).toEqual({});
  });

  it('should return both custodyAddress and verifiedAddresses when both options are true', async () => {
    const expectedCustodyAddress = 'mock-custody-address';
    const expectedVerifiedAddresses = [
      'mock-verified-address-1',
      'mock-verified-address-2',
    ];
    (getCustodyAddressForFidNeynar as Mock).mockResolvedValue(
      expectedCustodyAddress,
    );
    (getVerifiedAddressesForFidNeynar as Mock).mockResolvedValue(
      expectedVerifiedAddresses,
    );
    const result = await getFarcasterUserAddress(123, {
      hasCustodyAddress: true,
      hasVerifiedAddresses: true,
    });
    expect(result).toEqual({
      custodyAddress: expectedCustodyAddress,
      verifiedAddresses: expectedVerifiedAddresses,
    });
  });

  it('should only return custodyAddress  when hasVerifiedAddresses is false', async () => {
    const expectedCustodyAddress = 'mock-custody-address';
    (getCustodyAddressForFidNeynar as Mock).mockResolvedValue(
      expectedCustodyAddress,
    );
    const result = await getFarcasterUserAddress(123, {
      hasVerifiedAddresses: false,
    });
    expect(result).toEqual({ custodyAddress: expectedCustodyAddress });
  });

  it('should only return verifiedAddresses  when hasCustodyAddress is false', async () => {
    const expectedVerifiedAddresses = [
      'mock-verified-address-1',
      'mock-verified-address-2',
    ];
    (getVerifiedAddressesForFidNeynar as Mock).mockResolvedValue(
      expectedVerifiedAddresses,
    );
    const result = await getFarcasterUserAddress(123, {
      hasCustodyAddress: false,
    });
    expect(result).toEqual({ verifiedAddresses: expectedVerifiedAddresses });
  });

  it('should call getCustodyAddressForFidNeynar and getVerifiedAddressesForFidNeynar with the default neynarApiKey if not provided', async () => {
    await getFarcasterUserAddress(123);
    expect(getCustodyAddressForFidNeynar).toHaveBeenCalledWith(123, undefined);
    expect(getVerifiedAddressesForFidNeynar).toHaveBeenCalledWith(
      123,
      undefined,
    );
  });
});
