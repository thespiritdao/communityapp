import React from 'react';
import { Balances } from './Balances';

interface BalancesSectionProps {
  walletAddress: string;
}

export const BalancesSection: React.FC<BalancesSectionProps> = React.memo(
  ({ walletAddress }) => (
    <div className="profile-section">
      <h2>
        <strong>Balances</strong>
      </h2>
      <Balances />
    </div>
  ),
);

BalancesSection.displayName = 'BalancesSection';
