'use client';

import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, ExternalLink, AlertCircle } from 'lucide-react';
import type { EligibilityCriteria } from '../services/EligibilityService';

interface TokenBalanceInputProps {
  value: Partial<EligibilityCriteria>;
  onChange: (updates: Partial<EligibilityCriteria>) => void;
  disabled?: boolean;
}

const COMMON_TOKENS = [
  {
    name: 'Advocate Membership Token',
    address: process.env.NEXT_PUBLIC_ADVOCATE_TOKEN_ADDRESS,
    symbol: 'ADVOCATE',
    decimals: 0,
    type: 'ERC721' as const,
    description: 'Makes pod open to any verified member'
  },
  {
    name: 'Executive Pod Leader HAT',
    address: process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
    symbol: 'POD-EXEC',
    decimals: 0,
    type: 'HAT' as const
  },
  {
    name: 'Executive Pod Member HAT',
    address: process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER,
    symbol: 'POD-MEM',
    decimals: 0,
    type: 'HAT' as const
  },
  {
    name: 'Base ETH',
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'ETH',
    decimals: 18,
    type: 'NATIVE' as const
  },
  {
    name: 'USDC (Base)',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    type: 'ERC20' as const
  }
];

export const TokenBalanceInput: React.FC<TokenBalanceInputProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const [selectedToken, setSelectedToken] = useState<typeof COMMON_TOKENS[0] | null>(
    COMMON_TOKENS.find(token => token.address === value.contract_address) || null
  );

  const handleTokenSelect = (tokenAddress: string) => {
    const token = COMMON_TOKENS.find(t => t.address === tokenAddress);

    if (token) {
      setSelectedToken(token);
      onChange({
        contract_address: token.address,
        token_type: token.type === 'HAT' ? 'ERC20' : token.type,
        name: `${token.name} Balance Requirement`,
        description: token.description || `Must hold at least the specified amount of ${token.symbol}`,
        // Set default minimum based on token type
        minimum_amount: token.type === 'HAT' || token.type === 'ERC721' ? '1' :
                       token.decimals === 18 ? '1000000000000000000' : // 1.0 for 18 decimal tokens
                       token.decimals === 6 ? '1000000' : // 1.0 for 6 decimal tokens
                       '1'
      });
    }
  };

  const handleCustomAddress = (address: string) => {
    setSelectedToken(null);
    onChange({
      contract_address: address,
      token_type: 'ERC20',
      name: 'Custom Token Balance Requirement'
    });
  };

  const formatAmount = (amount: string, decimals = 18): string => {
    if (!amount) return '';
    
    try {
      const bigAmount = BigInt(amount);
      const divisor = BigInt(10 ** decimals);
      const wholePart = bigAmount / divisor;
      const fractionalPart = bigAmount % divisor;
      
      if (fractionalPart === 0n) {
        return wholePart.toString();
      }
      
      const fractionalStr = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '');
      return `${wholePart}.${fractionalStr}`;
    } catch {
      return amount;
    }
  };

  const parseAmount = (displayAmount: string, decimals = 18): string => {
    if (!displayAmount) return '';
    
    try {
      const parts = displayAmount.split('.');
      const wholePart = parts[0] || '0';
      const fractionalPart = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
      
      const amount = BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(fractionalPart || '0');
      return amount.toString();
    } catch {
      return displayAmount;
    }
  };

  const displayAmount = selectedToken ? 
    formatAmount(value.minimum_amount || '', selectedToken.decimals) : 
    value.minimum_amount || '';

  return (
    <Card className="border-l-4" style={{ borderLeftColor: '#3F7A5A' }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" />
          Token Balance Requirement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Select Token</Label>
          <select
            value={value.contract_address || ''}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                // Handle custom token selection
                return;
              }
              handleTokenSelect(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ outlineColor: '#3F7A5A' }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#3F7A5A'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
            disabled={disabled}
          >
            <option value="">Select a token...</option>
            {COMMON_TOKENS.map((token) => (
              <option key={token.address} value={token.address}>
                {token.name} ({token.symbol})
              </option>
            ))}
            <option value="custom">Custom Token Address...</option>
          </select>
        </div>

        {/* Custom token address input */}
        {(!selectedToken || value.contract_address === 'custom') && (
          <div>
            <Label>Custom Token Contract Address</Label>
            <Input
              value={value.contract_address || ''}
              onChange={(e) => handleCustomAddress(e.target.value)}
              placeholder="0x..."
              className="font-mono text-sm"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the contract address of the token you want to require
            </p>
          </div>
        )}

        {/* Token info display */}
        {selectedToken && (
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium" style={{ color: '#1F453A' }}>{selectedToken.name}</h4>
                <p className="text-sm" style={{ color: '#2F5D50' }}>
                  Symbol: {selectedToken.symbol} | Decimals: {selectedToken.decimals}
                </p>
              </div>
              <Badge variant="outline" style={{ color: '#2F5D50', borderColor: '#8FAAA1' }}>
                {selectedToken.type}
              </Badge>
            </div>

            {selectedToken.address !== '0x0000000000000000000000000000000000000000' && (
              <div className="flex items-center gap-2 mt-2">
                <code className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#E8F1EE' }}>
                  {selectedToken.address?.slice(0, 10)}...{selectedToken.address?.slice(-8)}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="p-1 h-auto"
                  onClick={() => window.open(`https://basescan.org/address/${selectedToken.address}`, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Minimum amount */}
        <div>
          <Label>Minimum Amount Required</Label>
          <Input
            type="number"
            step="any"
            value={displayAmount}
            onChange={(e) => {
              const rawAmount = selectedToken ? 
                parseAmount(e.target.value, selectedToken.decimals) : 
                e.target.value;
              onChange({ minimum_amount: rawAmount });
            }}
            placeholder={selectedToken?.type === 'HAT' ? '1' : '1.0'}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedToken?.type === 'HAT'
              ? 'For HAT tokens, 1 means the user must wear the hat'
              : selectedToken?.type === 'ERC721'
              ? 'For NFTs, 1 means the user must hold at least one token'
              : `Amount in ${selectedToken?.symbol || 'token units'} (${selectedToken?.decimals || 18} decimals)`
            }
          </p>
        </div>

        {/* Token type selection (for custom tokens) */}
        {!selectedToken && value.contract_address && value.contract_address !== 'custom' && (
          <div>
            <Label>Token Type</Label>
            <select
              value={value.token_type || 'ERC20'}
              onChange={(e) => onChange({ token_type: e.target.value as 'ERC20' | 'ERC721' | 'ERC1155' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
              style={{ outlineColor: '#3F7A5A' }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#3F7A5A'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              disabled={disabled}
            >
              <option value="ERC20">ERC20 (Fungible Token)</option>
              <option value="ERC721">ERC721 (NFT)</option>
              <option value="ERC1155">ERC1155 (Multi Token)</option>
            </select>
          </div>
        )}

        {/* Validation warnings */}
        {value.contract_address && !selectedToken && (
          <div className="border rounded-lg p-3" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" style={{ color: '#C6933F' }} />
              <div className="text-sm">
                <p className="font-medium" style={{ color: '#8F6B2F' }}>Custom Token</p>
                <p style={{ color: '#A67E35' }}>
                  Make sure this contract address is correct and the token is deployed on Base mainnet.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Preview */}
        {value.contract_address && value.minimum_amount && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h4 className="font-medium text-gray-900 mb-2">Requirement Preview</h4>
            <p className="text-sm text-gray-700">
              Users must hold at least{' '}
              <strong>
                {displayAmount} {selectedToken?.symbol || 'tokens'}
              </strong>
              {selectedToken?.type === 'HAT'
                ? ' (must wear the HAT)'
                : selectedToken?.type === 'ERC721'
                ? ' (must hold the NFT)'
                : ''} to be eligible for this role.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};