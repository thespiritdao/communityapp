// src\features\shopping-cart\components\Filter

"use client";

import { useProducts } from "src/features/shopping-cart/contexts/products-context";
import { useTokenBalances } from "src/context/TokenBalancesContext";
import { useState, useMemo } from "react";
import * as S from "./style";

// Define sort options - prices first, then token filters
const baseSortOptions = [
  { value: "priceLowHigh", label: "Price: Low to High" },
  { value: "priceHighLow", label: "Price: High to Low" },
];

const Filter = () => {
  const { filterProducts } = useProducts();
  const { balances } = useTokenBalances();
  const [selectedOption, setSelectedOption] = useState("");

  // Generate combined sort/filter options
  const allOptions = useMemo(() => {
    if (!balances) return [...baseSortOptions, { value: "no_token", label: "No Token Required" }];
    
    const options = [
      ...baseSortOptions,
      // Everyone can filter by "No Token Required" products
      { value: "no_token", label: "No Token Required" },
    ];

    // Add token filter options based on user's holdings
    if (balances.hasExecutivePod) {
      options.push({ value: "exec", label: "Executive Pod Only" });
    }
    if (balances.hasDevPod) {
      options.push({ value: "dev", label: "Dev Pod Only" });
    }
    if (balances.hasBountyHat) {
      options.push({ value: "bounty", label: "Bounty Hat Only" });
    }
    if (balances.hasProofOfCuriosity) {
      options.push({ value: "curiosity", label: "Proof of Curiosity Only" });
    }
    if (balances.hasMarketAdmin) {
      options.push({ value: "market_admin", label: "Market Admin Only" });
    }

    return options;
  }, [balances]);

  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedOption(value);
    
    // Determine if it's a sort option or token filter
    const isSortOption = baseSortOptions.some(option => option.value === value);
    
    if (isSortOption) {
      // It's a sort option
      filterProducts([], value, "");
    } else {
      // It's a token filter
      filterProducts([], "", value);
    }
  };

  return (
    <S.Container>
      <S.FilterGroup>
        <S.Label>Sort:</S.Label>
        <S.SortDropdown value={selectedOption} onChange={handleOptionChange}>
          <option value="">All Products</option>
          {allOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </S.SortDropdown>
      </S.FilterGroup>
    </S.Container>
  );
};

export default Filter;
