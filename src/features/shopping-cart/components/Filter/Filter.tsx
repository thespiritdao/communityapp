// src\features\shopping-cart\components\Filter

"use client";

import { useProducts } from "src/features/shopping-cart/contexts/products-context";
import { useState } from "react";
import * as S from "./style";

// Define sort options
const sortOptions = [
  { value: "priceLowHigh", label: "Price: Low to High" },
  { value: "priceHighLow", label: "Price: High to Low" },
];

const Filter = () => {
  // We'll assume your useProducts hook now supports sorting.
  // For example, you might update filterProducts to accept a second parameter for sort option.
  const { filterProducts } = useProducts();
  const [selectedSort, setSelectedSort] = useState("");

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sortValue = e.target.value;
    setSelectedSort(sortValue);
    // Call the filtering/sorting function with an empty filter array (or previous filters)
    // and the selected sort option.
    filterProducts([], sortValue);
  };

  return (
    <S.Container>
      <S.Label>Sort:</S.Label>
      <S.SortDropdown value={selectedSort} onChange={handleSortChange}>
        <option value="">Select...</option>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </S.SortDropdown>
    </S.Container>
  );
};

export default Filter;
