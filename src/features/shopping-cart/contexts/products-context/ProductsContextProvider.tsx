// src/features/shopping-cart/contexts/products-context/index.tsx

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type FC,
} from 'react';
import type { IProduct } from '../../models';

export interface UserCommunity {
  pod_id: string;
  pod_name: string;
  membership_type: string;
}

export interface IProductsContext {
  isFetching: boolean;
  setIsFetching: (state: boolean) => void;
  products: IProduct[];
  setProducts: (products: IProduct[]) => void;
  filters: string[];
  setFilters: (filters: string[]) => void;
  totalProductCount: number;
  setTotalProductCount: (count: number) => void;
  communityFilter: string;
  setCommunityFilter: (filter: string) => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  userCommunities: UserCommunity[];
  setUserCommunities: (communities: UserCommunity[]) => void;
}

const ProductsContext = createContext<IProductsContext | undefined>(undefined);

export const useProductsContext = (): IProductsContext => {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error(
      'useProductsContext must be used within a ProductsProvider',
    );
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
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [communityFilter, setCommunityFilter] = useState('my_communities');
  const [sortOption, setSortOption] = useState('');
  const [userCommunities, setUserCommunities] = useState<UserCommunity[]>([]);

  const value: IProductsContext = {
    isFetching,
    setIsFetching,
    products,
    setProducts,
    filters,
    setFilters,
    totalProductCount,
    setTotalProductCount,
    communityFilter,
    setCommunityFilter,
    sortOption,
    setSortOption,
    userCommunities,
    setUserCommunities,
  };

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
};
