// src/features/test-cart/components/ProductList.tsx
import React from 'react';
import { Product } from '../types';
import { PRODUCTS } from '../constants';

interface ProductListProps {
  onAddToCart: (product: Product) => void;
}

export function ProductList({ onAddToCart }: ProductListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      {PRODUCTS.map(product => (
        <div key={product.id} className="border rounded-lg p-4">
          <img 
            src={product.image} 
            alt={product.name}
            className="w-full h-48 object-cover rounded-lg"
          />
          <h3 className="text-xl font-bold mt-2">{product.name}</h3>
          <p className="text-gray-600">{product.description}</p>
          <p className="text-lg font-semibold mt-2">${product.price}</p>
          <button
            onClick={() => onAddToCart(product)}
            className="mt-2 w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
          >
            Add to Cart
          </button>
        </div>
      ))}
    </div>
  );
}