// src/features/shopping-cart/components/OrderManagementBar/OrderManagementBar.tsx
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { Package, Settings, Loader2 } from 'lucide-react';
import styled from 'styled-components';

const Container = styled.div`
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  padding: 15px 20px;
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  
  @media (max-width: 768px) {
    padding: 10px 15px;
    gap: 8px;
  }
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  background: ${(props) => (props.variant === 'primary' ? '#2F5D50' : '#8FAAA1')};
  color: #FFFFFF;
  border: none;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: ${(props) => (props.variant === 'primary' ? '#1F453A' : '#6F8F86')};
    transform: translateY(-1px);
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 768px) {
    padding: 8px 12px;
    font-size: 13px;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

interface OrderManagementBarProps {
  address: string;
}

export const OrderManagementBar: React.FC<OrderManagementBarProps> = ({
  address,
}) => {
  const router = useRouter();
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkManagementPermissions();
  }, [address]);

  const checkManagementPermissions = async () => {
    if (!address) {
      setCanManageOrders(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const tokenBalances = await fetchTokenBalances(address);

      // User can manage orders if they have Executive Pod OR Market Management tokens
      const hasPermissions =
        tokenBalances.hasExecutivePod || tokenBalances.hasMarketManagement;
      setCanManageOrders(hasPermissions);

      console.log('Order management permissions:', {
        address,
        hasExecutivePod: tokenBalances.hasExecutivePod,
        hasMarketManagement: tokenBalances.hasMarketManagement,
        canManageOrders: hasPermissions,
      });
    } catch (error) {
      console.error('Error checking order management permissions:', error);
      setCanManageOrders(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMyOrders = () => {
    router.push('/marketplace/my-orders');
  };

  const handleManageOrders = () => {
    router.push('/marketplace/orders');
  };

  if (isLoading) {
    return (
      <Container>
        <Button disabled={true}>
          <Loader2 className="animate-spin" />
          Loading...
        </Button>
      </Container>
    );
  }

  return (
    <Container>
      {/* All users can view their own order history */}
      <Button variant="primary" onClick={handleMyOrders}>
        <Package />
        My Orders
      </Button>

      {/* Only management users can access order management */}
      {canManageOrders && (
        <Button variant="secondary" onClick={handleManageOrders}>
          <Settings />
          Manage Orders
        </Button>
      )}
    </Container>
  );
};

export default OrderManagementBar;
