import React, { useState } from 'react';
import { BountyCard } from './BountyCard';

export interface Bounty {
  id: string;
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  status: 'open' | 'in-progress' | 'completed';
  createdAt: Date;
}

export interface BountyNotification {
  id: string;
  type: 'new_bounty' | 'bid_received' | 'bounty_completed';
  title: string;
  message: string;
  timestamp: Date;
}

interface BountyListProps {
  bounties: Bounty[];
  onBid?: (bountyId: string) => void;
}

export const BountyList: React.FC<BountyListProps> = ({ bounties, onBid }) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in-progress' | 'completed'>('all');

  const filteredBounties = bounties.filter(bounty => {
    if (statusFilter === 'all') return true;
    return bounty.status === statusFilter;
  });

  const getStatusCount = (status: 'open' | 'in-progress' | 'completed') => {
    return bounties.filter(bounty => bounty.status === status).length;
  };

  return (
    <div className="bounty-container">
      {/* Status Filter Buttons */}
      <div className="status-filters">
        <button
          className={`status-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All ({bounties.length})
        </button>
        <button
          className={`status-filter-btn open ${statusFilter === 'open' ? 'active' : ''}`}
          onClick={() => setStatusFilter('open')}
        >
          Open ({getStatusCount('open')})
        </button>
        <button
          className={`status-filter-btn in-progress ${statusFilter === 'in-progress' ? 'active' : ''}`}
          onClick={() => setStatusFilter('in-progress')}
        >
          In Progress ({getStatusCount('in-progress')})
        </button>
        <button
          className={`status-filter-btn completed ${statusFilter === 'completed' ? 'active' : ''}`}
          onClick={() => setStatusFilter('completed')}
        >
          Completed ({getStatusCount('completed')})
        </button>
      </div>

      {/* Bounty Grid */}
      <div className="bounty-grid">
        {filteredBounties.length === 0 ? (
          <div className="bounty-empty">
            <h3>No bounties found</h3>
            <p>
              {statusFilter === 'all' 
                ? 'No bounties have been created yet.' 
                : `No ${statusFilter} bounties found.`
              }
            </p>
          </div>
        ) : (
          filteredBounties.map((bounty) => (
            <BountyCard
              key={bounty.id}
              {...bounty}
              onBid={onBid ? () => onBid(bounty.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}; 