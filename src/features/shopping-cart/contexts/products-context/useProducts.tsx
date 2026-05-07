// src/features/shopping-cart/contexts/products-context/useProducts.tsx

import { useCallback } from 'react';
import { useProductsContext } from './ProductsContextProvider';
import type { IProduct } from '../../models';
import { createClient } from '@supabase/supabase-js';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  getAccessibleProductsForUser,
  sortProducts,
  filterProductsByCommunity,
} from '@/features/shopping-cart/services/accessControl';

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const useProducts = () => {
  const {
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
  } = useProductsContext();

  // Use the centralized token balances context and account
  const { balances: userTokens } = useTokenBalances();
  const { evmAddress: address } = useEvmAddress();

  // Fetch user's pod memberships from the database
  const fetchUserCommunities = useCallback(async () => {
    if (!address) return [];

    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('pod_id, pod_name, membership_type')
        .eq('wallet', address.toLowerCase());

      if (error) {
        console.error('🛒 Error fetching user communities:', error);
        return [];
      }

      // Deduplicate by pod_id (user may have multiple roles in same pod)
      const seen = new Set<string>();
      const unique = (data || []).filter((m) => {
        if (seen.has(m.pod_id)) return false;
        seen.add(m.pod_id);
        return true;
      });

      return unique;
    } catch (error) {
      console.error('🛒 Error fetching user communities:', error);
      return [];
    }
  }, [address]);

  // Fetch products from Supabase, load communities, and apply default filter.
  const fetchProducts = useCallback(async () => {
    setIsFetching(true);

    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) {
        console.error('🛒 Error fetching products:', error);
        setIsFetching(false);
        return;
      }

      // Always set the total product count
      setTotalProductCount(data.length);

      // Load user communities from DB
      const communities = await fetchUserCommunities();
      setUserCommunities(communities);

      if (!address || !userTokens) {
        // Return only products with no token requirements if user not authenticated
        const publicProducts = data.filter(
          (product: IProduct) =>
            !product.required_token && !product.requiredToken,
        );
        setProducts(publicProducts);
        setCommunityFilter('all_products');
        setIsFetching(false);
        return;
      }

      // Get all accessible products using the access control system
      const accessibleProducts = await getAccessibleProductsForUser(
        data,
        address,
        userTokens,
      );

      // Default to "My Communities" if user has communities, otherwise "All Products"
      const defaultFilter =
        communities.length > 0 ? 'my_communities' : 'all_products';
      const filtered = filterProductsByCommunity(
        accessibleProducts,
        defaultFilter,
        communities,
      );

      setCommunityFilter(defaultFilter);
      setProducts(filtered);

      console.log(
        `🛒 Loaded ${accessibleProducts.length} accessible products out of ${data.length} total (${communities.length} communities, default: ${defaultFilter})`,
      );
    } catch (error) {
      console.error('🛒 Error in fetchProducts:', error);
      setProducts([]);
    } finally {
      setIsFetching(false);
    }
  }, [
    setIsFetching,
    setProducts,
    setTotalProductCount,
    setCommunityFilter,
    setUserCommunities,
    address,
    userTokens,
    fetchUserCommunities,
  ]);

  // Filter and sort products. Sort and filter are independent — both apply simultaneously.
  const filterProducts = useCallback(
    async (
      selectedFilters: string[] = [],
      newSortOption = '',
      newCommunityFilter = 'my_communities',
    ) => {
      setIsFetching(true);

      try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) {
          console.error('🛒 Error fetching products for filtering:', error);
          setIsFetching(false);
          return;
        }

        let filteredProducts = data;

        // Apply size filters
        if (selectedFilters.length > 0) {
          filteredProducts = filteredProducts.filter((p: IProduct) =>
            selectedFilters.some((filter: string) =>
              (p.available_sizes || p.availableSizes || []).includes(filter),
            ),
          );
        }

        // Apply access control
        if (!address || !userTokens) {
          filteredProducts = filteredProducts.filter(
            (p: IProduct) => !p.required_token && !p.requiredToken,
          );
        } else {
          const accessibleProducts = await getAccessibleProductsForUser(
            filteredProducts,
            address,
            userTokens,
          );
          filteredProducts = accessibleProducts;
        }

        // Apply community filter (narrows within accessible products)
        filteredProducts = filterProductsByCommunity(
          filteredProducts,
          newCommunityFilter,
          userCommunities,
        );

        // Apply sorting
        const sortedProducts = sortProducts(filteredProducts, newSortOption);

        console.log(
          `🛒 Filtered to ${sortedProducts.length} products (community: ${newCommunityFilter}, sort: ${newSortOption || 'default'})`,
        );

        setFilters(selectedFilters);
        setCommunityFilter(newCommunityFilter);
        setSortOption(newSortOption);
        setProducts(sortedProducts);
      } catch (error) {
        console.error('🛒 Error in filterProducts:', error);
        setProducts([]);
      } finally {
        setIsFetching(false);
      }
    },
    [
      setIsFetching,
      setProducts,
      setFilters,
      setCommunityFilter,
      setSortOption,
      address,
      userTokens,
      userCommunities,
    ],
  );

  return {
    isFetching,
    fetchProducts,
    products,
    filterProducts,
    filters,
    totalProductCount,
    communityFilter,
    sortOption,
    userCommunities,
  };
};

export default useProducts;
