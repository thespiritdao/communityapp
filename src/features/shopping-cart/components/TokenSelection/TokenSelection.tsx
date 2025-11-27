// src/features/shopping-cart/components/TokenSelection/TokenSelection.tsx
'use client';

import type React from 'react';
import styled from 'styled-components';
import type { Token } from '../../hooks/useCartCalculations';

const TokenSelectionContainer = styled.div`
  margin: 1rem 0;
`;

const TokenRadioLabel = styled.label`
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin-right: 1rem;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #f5f5f5;
  }
  
  input[type="radio"] {
    margin-right: 8px;
  }
`;

const TokenImage = styled.img`
  width: 24px;
  height: 24px;
  vertical-align: middle;
  margin-right: 4px;
  border: none;
  border-radius: 50%;
`;

const TokenSymbol = styled.span`
  font-weight: 500;
  font-size: 14px;
`;

export interface TokenSelectionProps {
  selectedToken: Token;
  onTokenChange: (token: Token) => void;
  tokenOptions: Token[];
  disabled?: boolean;
  className?: string;
}

/**
 * TokenSelection component for choosing between available payment tokens
 * 
 * Features:
 * - Radio button selection between tokens
 * - Visual token icons and symbols
 * - Responsive design
 * - Accessible markup
 */
export const TokenSelection: React.FC<TokenSelectionProps> = ({
  selectedToken,
  onTokenChange,
  tokenOptions,
  disabled = false,
  className = ''
}) => {
  return (
    <TokenSelectionContainer className={className}>
      {tokenOptions.map((token, index) => (
        <TokenRadioLabel key={token.symbol}>
          <input
            type="radio"
            name="tokenSelection"
            value={token.symbol}
            checked={selectedToken.symbol === token.symbol}
            onChange={() => onTokenChange(token)}
            disabled={disabled}
          />
          <TokenImage
            src={token.image}
            alt={token.symbol}
          />
          <TokenSymbol>{token.symbol}</TokenSymbol>
        </TokenRadioLabel>
      ))}
    </TokenSelectionContainer>
  );
};

export default TokenSelection;