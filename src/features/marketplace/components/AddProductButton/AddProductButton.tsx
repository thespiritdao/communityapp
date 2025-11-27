// src/features/marketplace/components/AddProductButton/AddProductButton.tsx
'use client';

import { useState } from 'react';
import { useMarketplaceManagementAccess } from '@/features/marketplace/hooks/useMarketplaceManagementAccess';
import AddProductModal from '../AddProductModal/AddProductModal';
import { Plus } from 'lucide-react';
import * as S from './AddProductButton.style';

const AddProductButton = () => {
  const { managedPods, isLoading } = useMarketplaceManagementAccess();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Don't show button if user doesn't have access or we're still checking
  if (managedPods.length === 0 || isLoading) {
    return null;
  }

  return (
    <>
      <S.AddProductButton onClick={handleOpenModal}>
        <Plus aria-hidden="true" />
        <S.ButtonText>Add Product</S.ButtonText>
      </S.AddProductButton>

      <AddProductModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  );
};

export default AddProductButton;
