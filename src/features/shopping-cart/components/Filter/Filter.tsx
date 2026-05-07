// src/features/shopping-cart/components/Filter/Filter.tsx

'use client';

import { useProducts } from '@/features/shopping-cart/contexts/products-context';
import * as S from './style';

const Filter = () => {
  const {
    filterProducts,
    communityFilter,
    sortOption,
    userCommunities,
  } = useProducts();

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    filterProducts([], sortOption, value);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    filterProducts([], value, communityFilter);
  };

  return (
    <S.Container>
      <S.FilterGrid>
        {/* Community / Access Filter */}
        <S.FilterGroup>
          <S.Label>Filter</S.Label>
          <S.FilterDropdown value={communityFilter} onChange={handleFilterChange}>
            {userCommunities.length > 0 && (
              <option value="my_communities">My Communities</option>
            )}
            <option value="all_products">All Products</option>
            <option value="no_token_required">No Token Required</option>
            {userCommunities.length > 0 && (
              <optgroup label="Communities">
                {userCommunities.map((community) => (
                  <option
                    key={community.pod_id}
                    value={`community_${community.pod_id}`}
                  >
                    {community.pod_name || 'Unnamed Community'}
                  </option>
                ))}
              </optgroup>
            )}
          </S.FilterDropdown>
        </S.FilterGroup>

        {/* Sort */}
        <S.FilterGroup>
          <S.Label>Sort</S.Label>
          <S.SortDropdown value={sortOption} onChange={handleSortChange}>
            <option value="">Default</option>
            <option value="newest">Newest First</option>
            <option value="priceLowHigh">Price: Low to High</option>
            <option value="priceHighLow">Price: High to Low</option>
          </S.SortDropdown>
        </S.FilterGroup>
      </S.FilterGrid>
    </S.Container>
  );
};

export default Filter;
