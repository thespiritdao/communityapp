import React from 'react';
import { DatabaseTokenGallery } from './DatabaseTokenGallery';

interface TokenSectionProps {
  walletAddress: string;
  title: string;
  category: 'membership' | 'credential';
}

export const TokenSection: React.FC<TokenSectionProps> = React.memo(({
  walletAddress,
  title,
  category
}) => (
  <div className="badges-section">
    <h2><strong>{title}</strong></h2>
    <DatabaseTokenGallery walletAddress={walletAddress} category={category} />
  </div>
));

TokenSection.displayName = 'TokenSection';