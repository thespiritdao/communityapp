import { useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { fetchTokenBalances } from '../../../utils/fetchTokenBalances';
import {
  getUserIdentity,
  canAccessBounties,
  logUserIdentity,
} from '../../../utils/accessControlUtils';
import { useHatPermissions } from '../../../hooks/useHatPermissions';
import type { Bounty, BountyNotification } from '../components/BountyList';

export const useBounty = () => {
  const address = useUserWallet();
  const { userHats } = useHatPermissions();
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [notifications, setNotifications] = useState<BountyNotification[]>([]);
  const [isTokenHolder, setIsTokenHolder] = useState(false);
  const [bountyAccess, setBountyAccess] = useState<boolean>(false);

  useEffect(() => {
    const checkBountyAccess = async () => {
      if (!address) {
        setIsTokenHolder(false);
        setBountyAccess(false);
        return;
      }

      try {
        // Get token balances
        const balances = await fetchTokenBalances(address);

        // Legacy token holder check (backwards compatibility)
        const legacyTokenHolder =
          balances.hasExecutivePod ||
          balances.hasDevPod ||
          balances.hasMarketAdmin;
        setIsTokenHolder(legacyTokenHolder);

        // NEW: Use normalized access control system
        const identity = await getUserIdentity(address, balances, userHats);
        logUserIdentity(identity, 'Bounty Access Check');

        const hasAccess = canAccessBounties(identity);
        console.log(`💰 User can access bounties: ${hasAccess}`);
        setBountyAccess(hasAccess);
      } catch (error) {
        console.error('Error checking bounty access:', error);
        setIsTokenHolder(false);
        setBountyAccess(false);
      }
    };

    checkBountyAccess();
  }, [address, userHats]);

  const createBounty = async (bountyData: Omit<Bounty, 'id' | 'createdAt'>) => {
    // TODO: Implement onchain bounty creation
    const newBounty: Bounty = {
      ...bountyData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    };

    setBounties((prev) => [...prev, newBounty]);

    // Notify token holders
    const notification: BountyNotification = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'new_bounty',
      title: 'New Bounty Created',
      message: `A new bounty "${bountyData.title}" has been created.`,
      timestamp: new Date(),
    };

    setNotifications((prev) => [...prev, notification]);
  };

  const placeBid = async (bountyId: string) => {
    // TODO: Implement onchain bidding
    const bounty = bounties.find((b) => b.id === bountyId);
    if (!bounty) return;

    const notification: BountyNotification = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'bid_received',
      title: 'New Bid Received',
      message: `A new bid has been placed on "${bounty.title}".`,
      timestamp: new Date(),
    };

    setNotifications((prev) => [...prev, notification]);
  };

  const completeBounty = async (bountyId: string) => {
    // TODO: Implement onchain bounty completion
    const bounty = bounties.find((b) => b.id === bountyId);
    if (!bounty) return;

    setBounties((prev) =>
      prev.map((b) => (b.id === bountyId ? { ...b, status: 'completed' } : b)),
    );

    const notification: BountyNotification = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'bounty_completed',
      title: 'Bounty Completed',
      message: `The bounty "${bounty.title}" has been completed.`,
      timestamp: new Date(),
    };

    setNotifications((prev) => [...prev, notification]);
  };

  return {
    bounties,
    notifications,
    isTokenHolder, // Legacy compatibility
    bountyAccess, // NEW: Normalized access control
    createBounty,
    placeBid,
    completeBounty,
  };
};
