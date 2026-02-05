'use client';

import React, { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { MintDonationButton } from './components/MintDonationButton';

interface Donation {
  id: string;
  user_wallet: string;
  donor_email: string | null;
  fiat_amount: number;
  system_tokens_to_mint: number;
  payment_method: string;
  settlement_date: string | null;
  status: string;
  created_at: string;
  settled_at: string | null;
  approvals?: { approver_wallet: string; approved_at: string }[];
  currentApprovals?: number;
  requiredApprovals?: number;
}

export default function ExecutiveDonationsDashboard() {
  const evmAddress = useEvmAddress();
  const { address: walletAddress, isInitializing } = useCDPStatus();
  const isConnected = !!walletAddress && !isInitializing;
  const [donations, setDonations] = useState<Donation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [filter, setFilter] = useState<'awaiting_approval' | 'all'>('awaiting_approval');

  useEffect(() => {
    fetchDonations();
  }, [filter]);

  const fetchDonations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/executive/donations');
      const data = await response.json();

      if (response.ok) {
        let filteredDonations = data.donations || [];

        if (filter === 'awaiting_approval') {
          filteredDonations = filteredDonations.filter(
            (d: Donation) => d.status === 'awaiting_executive_approval'
          );
        }

        setDonations(filteredDonations);
      } else {
        toast.error('Failed to load donations');
      }
    } catch (error) {
      console.error('Failed to fetch donations:', error);
      toast.error('Failed to load donations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveDonation = async (donationId: string) => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    setIsApproving(donationId);

    try {
      const response = await fetch('/api/donations/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          donationId,
          executiveWallet: walletAddress,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.thresholdMet) {
          toast.success('Donation approved! Minting has been triggered.');
        } else {
          toast.success(`Approval recorded. ${2 - data.currentApprovals} more approval(s) needed.`);
        }

        // Refresh the list
        await fetchDonations();
      } else {
        toast.error(data.error || 'Failed to approve donation');
      }
    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error('Failed to approve donation');
    } finally {
      setIsApproving(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      awaiting_executive_approval: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      pending_mint: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      minting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      minted: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      disputed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
  };

  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const checkIfUserApproved = (donation: Donation) => {
    if (!walletAddress || !donation.approvals) return false;
    return donation.approvals.some(
      approval => approval.approver_wallet.toLowerCase() === walletAddress.toLowerCase()
    );
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Executive Access Required
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Please connect your wallet to access the Executive Dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Executive Donation Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Review and approve donations for $SYSTEM token minting (2-of-3 multi-sig)
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setFilter('awaiting_approval')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'awaiting_approval'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Pending Approval
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            All Donations
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading donations...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && donations.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              No Donations to Review
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              {filter === 'awaiting_approval'
                ? 'All donations have been processed'
                : 'No donations found'}
            </p>
          </div>
        )}

        {/* Donations List */}
        {!isLoading && donations.length > 0 && (
          <div className="space-y-4">
            {donations.map((donation) => {
              const userHasApproved = checkIfUserApproved(donation);
              const canApprove = donation.status === 'awaiting_executive_approval' && !userHasApproved;

              return (
                <div
                  key={donation.id}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Donation Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(donation.status)}`}>
                          {formatStatus(donation.status)}
                        </span>
                        {userHasApproved && (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                            ✓ You Approved
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Amount</p>
                          <p className="font-bold text-gray-900 dark:text-white">
                            ${donation.fiat_amount.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">$SYSTEM to Mint</p>
                          <p className="font-bold text-green-600 dark:text-green-400">
                            {donation.system_tokens_to_mint.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Payment Method</p>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {donation.payment_method === 'us_bank_account' ? 'ACH' : 'Card'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Donor Wallet</p>
                          <p className="font-mono text-xs text-gray-900 dark:text-white truncate">
                            {donation.user_wallet}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Settled</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {donation.settled_at
                              ? formatDistanceToNow(new Date(donation.settled_at), { addSuffix: true })
                              : 'Pending'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Approvals</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {donation.currentApprovals || 0} / {donation.requiredApprovals || 2}
                          </p>
                        </div>
                      </div>

                      {donation.donor_email && (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Donor Email</p>
                          <p className="text-sm text-gray-900 dark:text-white">{donation.donor_email}</p>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="flex-shrink-0">
                      {canApprove && (
                        <button
                          onClick={() => handleApproveDonation(donation.id)}
                          disabled={isApproving === donation.id}
                          className="w-full lg:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                        >
                          {isApproving === donation.id ? 'Approving...' : 'Approve Donation'}
                        </button>
                      )}
                      {userHasApproved && donation.status === 'awaiting_executive_approval' && (
                        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                          Waiting for 1 more approval
                        </div>
                      )}
                      {donation.status === 'pending_mint' && (
                        <div className="space-y-2">
                          <MintDonationButton
                            donationId={donation.id}
                            recipientAddress={donation.user_wallet}
                            amount={donation.system_tokens_to_mint}
                            onSuccess={() => {
                              toast.success('Minting transaction submitted!');
                              fetchDonations(); // Refresh list
                            }}
                            onError={(error) => {
                              toast.error(`Minting failed: ${error}`);
                            }}
                          />
                          <p className="text-xs text-center text-gray-600 dark:text-gray-400">
                            Click to mint tokens (gasless)
                          </p>
                        </div>
                      )}
                      {donation.status === 'minting' && (
                        <div className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          ⏳ Minting in progress...
                        </div>
                      )}
                      {donation.status === 'minted' && (
                        <div className="text-center text-sm text-green-600 dark:text-green-400 font-semibold">
                          ✓ Tokens Minted
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
