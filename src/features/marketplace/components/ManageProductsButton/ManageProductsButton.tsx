// src/features/marketplace/components/ManageProductsButton/ManageProductsButton.tsx
'use client';

import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useMarketplaceManagementAccess } from '@/features/marketplace/hooks/useMarketplaceManagementAccess';
import { ProductManagement } from '../ProductManagement/ProductManagement';
import { Settings } from 'lucide-react';
import * as S from './ManageProductsButton.style';

const ManageProductsButton = () => {
  const { evmAddress: address } = useEvmAddress();
  const { managedPods, isLoading } = useMarketplaceManagementAccess();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Don't show button if user doesn't have access or we're still checking
  if (managedPods.length === 0 || isLoading || !address) {
    return null;
  }

  return (
    <>
      <S.ManageProductsButton onClick={handleOpenModal}>
        <Settings aria-hidden="true" />
        <S.ButtonText>Manage</S.ButtonText>
      </S.ManageProductsButton>

      {isModalOpen && <ProductManagement onClose={handleCloseModal} />}
    </>
  );
};

export default ManageProductsButton;
