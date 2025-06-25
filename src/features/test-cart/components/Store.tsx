'use client';

import React, { useState } from 'react';
import { ProductList } from './ProductList';
import { Cart } from './Cart';
import { Checkout } from './Checkout';
import { useCart } from '../hooks/useCart';
import { Product } from '../types';
import { ConnectButton, useAccount } from '@coinbase/onchainkit';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from '@coinbase/onchainkit/transaction';

const BASE_CHAIN_ID = 8453;

export function Store() {
  const { address } = useAccount();
  const {
    cartState,
    addToCart,
    removeFromCart,
    updateQuantity,
    setSelectedToken
  } = useCart();

  if (!address) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to the Store</h1>
        <p className="mb-4">Please connect your wallet to continue</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <ProductList onAddToCart={addToCart} />
        </div>
        
        <div className="space-y-6">
          <Cart
            items={cartState.items}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
          />
          
          <Checkout
            items={cartState.items}
            total={cartState.total}
            selectedToken={cartState.selectedToken}
            onTokenSelect={setSelectedToken}
          />
        </div>
      </div>
    </div>
  );
}