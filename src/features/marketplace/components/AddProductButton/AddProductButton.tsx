// src/features/marketplace/components/AddProductButton/AddProductButton.tsx
"use client";

import React, { useState } from "react";
import { useMarketManagementAccess } from "src/utils/marketManagement";
import AddProductModal from "../AddProductModal/AddProductModal";
import * as S from "./AddProductButton.style";

const AddProductButton = () => {
  const { hasAccess, isChecking } = useMarketManagementAccess();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Don't show button if user doesn't have access or we're still checking
  if (!hasAccess || isChecking) {
    return null;
  }

  return (
    <>
      <S.AddProductButton onClick={handleOpenModal}>
        <S.PlusIcon>+</S.PlusIcon>
        <S.ButtonText>Add Product</S.ButtonText>
      </S.AddProductButton>
      
      {isModalOpen && (
        <AddProductModal 
          isOpen={isModalOpen} 
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

export default AddProductButton;