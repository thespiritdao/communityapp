'use client';

// src/features/test-cart/hooks/useCart.ts
import { useState, useCallback } from 'react';
import { CartItem, CheckoutState, Product } from '../types';

export function useCart() {
  const [cartState, setCartState] = useState<CheckoutState>({
    items: [],
    total: 0,
    selectedToken: null
  });

  const addToCart = useCallback((product: Product) => {
    setCartState(prev => {
      const existingItem = prev.items.find(i => i.id === product.id);
      
      if (existingItem) {
        return {
          ...prev,
          items: prev.items.map(i => 
            i.id === product.id 
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
          total: prev.total + product.price
        };
      }

      const newItem: CartItem = {
        ...product,
        quantity: 1
      };

      return {
        ...prev,
        items: [...prev.items, newItem],
        total: prev.total + product.price
      };
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCartState(prev => {
      const item = prev.items.find(i => i.id === itemId);
      if (!item) return prev;

      return {
        ...prev,
        items: prev.items.filter(i => i.id !== itemId),
        total: prev.total - (item.price * item.quantity)
      };
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    setCartState(prev => {
      const item = prev.items.find(i => i.id === itemId);
      if (!item) return prev;

      const quantityDiff = quantity - item.quantity;
      
      return {
        ...prev,
        items: prev.items.map(i => 
          i.id === itemId ? { ...i, quantity } : i
        ),
        total: prev.total + (item.price * quantityDiff)
      };
    });
  }, []);

  const setSelectedToken = useCallback((token: 'SELF' | 'SYSTEM' | null) => {
    setCartState(prev => ({
      ...prev,
      selectedToken: token
    }));
  }, []);

  return {
    cartState,
    addToCart,
    removeFromCart,
    updateQuantity,
    setSelectedToken
  };
}