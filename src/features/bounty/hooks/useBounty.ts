import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import type { Bounty, BountyNotification } from '../components/BountyList';

export const useBounty = () => {
  const { address } = useAccount();
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [notifications, setNotifications] = useState<BountyNotification[]>([]);
  const [isTokenHolder, setIsTokenHolder] = useState(false);

  useEffect(() => {
    const checkTokenHolder = async () => {
      if (address) {
        const balances = await fetchTokenBalances(address);
        setIsTokenHolder(
          balances.hasExecutivePod ||
          balances.hasDevPod ||
          balances.hasMarketAdmin
        );
      }
    };

    checkTokenHolder();
  }, [address]);

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
      prev.map((b) =>
        b.id === bountyId ? { ...b, status: 'completed' } : b
      )
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
    isTokenHolder,
    createBounty,
    placeBid,
    completeBounty,
  };
}; 