// src/features/shopping-cart/components/OrderManagementBar/OrderManagementBar.tsx
'use client';

import type React from 'react';
import { useRouter } from 'next/navigation';
import { useHatPermissions } from '@/hooks/useHatPermissions';
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

  // Order management is gated by the pod role-permission system (the same
  // `marketplaceManage` permission that grants product management), NOT by
  // hardcoded Exec/Market hat balances.
  const { permissions, isLoading } = useHatPermissions();
  const canManageOrders = !!permissions?.marketplaceManage;

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
