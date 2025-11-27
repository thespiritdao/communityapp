import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeBoundMembershipStatus } from '../components/TimeBoundMembershipStatus';
import { useTimeBoundMembership } from '../hooks/useTimeBoundMembership';

// Mock the hook
vi.mock('../hooks/useTimeBoundMembership');
const mockUseTimeBoundMembership = useTimeBoundMembership as any;

// Mock Wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1234567890123456789012345678901234567890' }),
  useWalletClient: () => ({ data: null }),
}));

describe('TimeBoundMembership Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display active membership with time remaining', async () => {
    const mockMembership = {
      hatId: '123',
      userAddress: '0x1234567890123456789012345678901234567890',
      eligible: true,
      validFrom: new Date('2024-01-01'),
      validUntil: new Date('2024-12-31'),
      timeRemaining: 7 * 24 * 60 * 60 * 1000, // 7 days
      status: 'active' as const,
      reason: undefined,
    };

    mockUseTimeBoundMembership.mockReturnValue({
      membership: mockMembership,
      loading: false,
      error: null,
      lastChecked: new Date(),
      refresh: vi.fn(),
      updateTimeBounds: vi.fn(),
      isExpiringSoon: false,
      formattedTimeRemaining: '7 days, 0 hours',
      statusInfo: { color: 'green', message: 'Membership active' },
      checkMembershipStatus: vi.fn(),
    });

    render(
      <TimeBoundMembershipStatus
        hatId={BigInt(123)}
        roleType="member"
        showActions={true}
      />,
    );

    expect(screen.getByText('Time-Bound Membership')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Membership active')).toBeInTheDocument();
    expect(screen.getByText('7 days, 0 hours')).toBeInTheDocument();
  });

  it('should show expiration warning when membership is expiring soon', async () => {
    const mockMembership = {
      hatId: '123',
      userAddress: '0x1234567890123456789012345678901234567890',
      eligible: true,
      validFrom: new Date('2024-01-01'),
      validUntil: new Date('2024-12-31'),
      timeRemaining: 2 * 60 * 60 * 1000, // 2 hours
      status: 'active' as const,
      reason: undefined,
    };

    mockUseTimeBoundMembership.mockReturnValue({
      membership: mockMembership,
      loading: false,
      error: null,
      lastChecked: new Date(),
      refresh: vi.fn(),
      updateTimeBounds: vi.fn(),
      isExpiringSoon: true,
      formattedTimeRemaining: '2 hours, 0 minutes',
      statusInfo: { color: 'yellow', message: 'Membership expiring soon' },
      checkMembershipStatus: vi.fn(),
    });

    render(<TimeBoundMembershipStatus hatId={BigInt(123)} roleType="member" />);

    expect(
      screen.getByText('Your member membership expires in 2 hours, 0 minutes!'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Contact pod administrators to extend/),
    ).toBeInTheDocument();
  });

  it('should show expired status', async () => {
    const mockMembership = {
      hatId: '123',
      userAddress: '0x1234567890123456789012345678901234567890',
      eligible: false,
      validFrom: new Date('2024-01-01'),
      validUntil: new Date('2024-01-31'),
      timeRemaining: 0,
      status: 'expired' as const,
      reason: 'Time period has ended',
    };

    mockUseTimeBoundMembership.mockReturnValue({
      membership: mockMembership,
      loading: false,
      error: null,
      lastChecked: new Date(),
      refresh: vi.fn(),
      updateTimeBounds: vi.fn(),
      isExpiringSoon: false,
      formattedTimeRemaining: null,
      statusInfo: { color: 'red', message: 'Membership expired' },
      checkMembershipStatus: vi.fn(),
    });

    render(<TimeBoundMembershipStatus hatId={BigInt(123)} roleType="leader" />);

    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(
      screen.getByText('Your leader membership has expired'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You no longer have access to leader privileges/),
    ).toBeInTheDocument();
  });

  it('should handle refresh action', async () => {
    const mockRefresh = vi.fn();

    mockUseTimeBoundMembership.mockReturnValue({
      membership: null,
      loading: false,
      error: null,
      lastChecked: new Date(),
      refresh: mockRefresh,
      updateTimeBounds: vi.fn(),
      isExpiringSoon: false,
      formattedTimeRemaining: null,
      statusInfo: { color: 'gray', message: 'No membership data' },
      checkMembershipStatus: vi.fn(),
    });

    render(<TimeBoundMembershipStatus hatId={BigInt(123)} roleType="member" />);

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('should handle loading state', async () => {
    mockUseTimeBoundMembership.mockReturnValue({
      membership: null,
      loading: true,
      error: null,
      lastChecked: null,
      refresh: vi.fn(),
      updateTimeBounds: vi.fn(),
      isExpiringSoon: false,
      formattedTimeRemaining: null,
      statusInfo: { color: 'gray', message: 'No membership data' },
      checkMembershipStatus: vi.fn(),
    });

    render(<TimeBoundMembershipStatus hatId={BigInt(123)} roleType="member" />);

    expect(
      screen.getByText('Checking membership status...'),
    ).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    mockUseTimeBoundMembership.mockReturnValue({
      membership: null,
      loading: false,
      error: 'Network connection failed',
      lastChecked: null,
      refresh: vi.fn(),
      updateTimeBounds: vi.fn(),
      isExpiringSoon: false,
      formattedTimeRemaining: null,
      statusInfo: { color: 'gray', message: 'No membership data' },
      checkMembershipStatus: vi.fn(),
    });

    render(<TimeBoundMembershipStatus hatId={BigInt(123)} roleType="member" />);

    expect(
      screen.getByText('Error checking membership: Network connection failed'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
