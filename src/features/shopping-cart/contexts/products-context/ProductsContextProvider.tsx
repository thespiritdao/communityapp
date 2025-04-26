// src/features/shopping-cart/contexts/products-context/index.tsx

import React, { createContext, useContext, useState, ReactNode, FC } from 'react';
import { IProduct } from 'models';

export interface IProductsContext {
  isFetching: boolean;
  setIsFetching: (state: boolean) => void;
  products: IProduct[];
  setProducts: (products: IProduct[]) => void;
  filters: string[];
  setFilters: (filters: string[]) => void;
}

const ProductsContext = createContext<IProductsContext | undefined>(undefined);

export const useProductsContext = (): IProductsContext => {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error('useProductsContext must be used within a ProductsProvider');
  }
  return context;
};

interface ProductsProviderProps {
  children: ReactNode;
}

export const ProductsProvider: FC<ProductsProviderProps> = ({ children }) => {
  const [isFetching, setIsFetching] = useState(false);
  const [products, setProducts] = useState<IProduct[]>([]);
  const [filters, setFilters] = useState<string[]>([]);

  const value: IProductsContext = {
    isFetching,
    setIsFetching,
    products,
    setProducts,
    filters,
    setFilters,
  };

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
};
