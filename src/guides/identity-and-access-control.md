# Identity & Access Control System Guide

## 🎯 Overview

This guide explains the unified multi-token identity and access control system used throughout the DAO application. Our approach normalizes different token types (ERC-20, ERC-721, ERC-1155, HATs Protocol) into a single `UserIdentity` interface for consistent access control across all features.

---

## 🏗️ Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    User Identity Layer                      │
├─────────────────────────────────────────────────────────────┤
│  getUserIdentity() → UserIdentity (tokens + HATs)          │
│  ├── Token Balances (ERC-20/721/1155)                      │
│  └── HAT Permissions (Roles & Eligibility)                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Access Control Layer                     │
├─────────────────────────────────────────────────────────────┤
│  Feature-Specific Access Functions                         │
│  ├── canAccessForums(userIdentity)                         │
│  ├── canAccessEvents(userIdentity)                         │
│  ├── canParticipateInGovernance(userIdentity)              │
│  └── canUserAccessProduct(userIdentity)                    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Link Tables (Many-to-Many)                               │
│  ├── forum_category_required_tokens                        │
│  ├── event_required_tokens                                 │
│  └── RPC Functions for Server-Side Access Control          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Identity System Deep Dive

### 1. UserIdentity Interface

The core of our system is the `UserIdentity` interface that aggregates all user permissions:

```typescript
// src/utils/accessControlUtils.ts
export interface UserIdentity {
  address: string;
  tokens: {
    // Pod-based roles (HATs Protocol)
    hasExecutivePod: boolean;
    hasDevPod: boolean;
    hasBountyHat: boolean;
    hasEventManagement: boolean;
    hasMarketAdmin: boolean;
    hasMarketManagement: boolean;
    hasProofOfCuriosity: boolean;
    
    // Token balances (ERC-20)
    systemBalance: string;
    selfBalance: string;
  };
  hats: string[]; // Raw HAT IDs for advanced use cases
}
```

### 2. Identity Resolution Process

```typescript
export const getUserIdentity = async (
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[]
): Promise<UserIdentity> => {
  // 1. Normalize address (lowercase)
  const normalizedAddress = userAddress.toLowerCase();
  
  // 2. Fetch token balances if not provided
  const balances = tokenBalances || await fetchTokenBalances(userAddress);
  
  // 3. Aggregate into UserIdentity
  return {
    address: normalizedAddress,
    tokens: balances,
    hats: userHats || []
  };
};
```

### 3. Context Integration

Our identity system integrates with React contexts for efficient state management:

```typescript
// Primary contexts used
const { balances, isLoading } = useTokenBalances(); // Token/HAT balances
const { address } = useAccount(); // Wallet connection
const { permissions } = useHatPermissions(); // HAT-specific permissions
```

---

## 🛠️ How to Integrate New Routes/Features

### Step 1: Create Feature-Specific Access Control

Create a service file for your feature's access logic:

```typescript
// src/features/your-feature/services/accessControl.ts
import { getUserIdentity, type UserIdentity } from '@/utils/accessControlUtils';

/**
 * Check if user can access your feature
 */
export const canUserAccessFeature = (userIdentity: UserIdentity): boolean => {
  // Example: Require executive pod OR proof of curiosity
  return userIdentity.tokens.hasExecutivePod || 
         userIdentity.tokens.hasProofOfCuriosity;
};

/**
 * Get accessible items for user
 */
export const getAccessibleItemsForUser = async (
  items: YourItemType[],
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[]
): Promise<YourItemType[]> => {
  try {
    const userIdentity = await getUserIdentity(userAddress, tokenBalances, userHats);
    return items.filter(item => canUserAccessItem(item, userIdentity));
  } catch (error) {
    console.error('🔧 Error getting accessible items:', error);
    return []; // Return empty on error
  }
};
```

### Step 2: Database Schema (If Needed)

If your feature requires database-level access control, create link tables:

```sql
-- Example: your_feature_required_tokens table
CREATE TABLE your_feature_required_tokens (
  id SERIAL PRIMARY KEY,
  feature_item_id INTEGER REFERENCES your_feature_items(id),
  required_token_id VARCHAR(50) REFERENCES tokens(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- RPC function for server-side access control
CREATE OR REPLACE FUNCTION your_feature_accessible_by_identity(
  user_address TEXT,
  user_tokens JSONB DEFAULT NULL,
  user_hats TEXT[] DEFAULT NULL
)
RETURNS TABLE(item_id INTEGER) AS $$
BEGIN
  -- Implementation similar to forums_accessible_by_identity
  -- Check user_tokens JSONB against required_token_id
  RETURN QUERY
    SELECT yfi.id
    FROM your_feature_items yfi
    LEFT JOIN your_feature_required_tokens yfrt ON yfi.id = yfrt.feature_item_id
    WHERE yfrt.required_token_id IS NULL -- No token required
       OR (user_tokens->>'hasExecutivePod')::boolean = true -- Example check
       OR user_address = ANY(user_hats); -- HAT-based access
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 3: Component Integration Pattern

Follow this pattern in your React components:

```typescript
// src/app/your-feature/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { getUserIdentity, type UserIdentity } from '@/utils/accessControlUtils';
import { getAccessibleItemsForUser } from '@/features/your-feature/services/accessControl';

export default function YourFeaturePage() {
  const { address } = useAccount();
  const { balances, isLoading: tokenLoading } = useTokenBalances();
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [items, setItems] = useState<YourItemType[]>([]);
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(true);

  // Load user identity
  useEffect(() => {
    const loadUserIdentity = async () => {
      if (!address || !balances || tokenLoading) {
        setUserIdentity(null);
        setIsLoadingIdentity(false);
        return;
      }

      setIsLoadingIdentity(true);
      try {
        const identity = await getUserIdentity(address, balances);
        setUserIdentity(identity);
        console.log('🔧 Your feature loaded user identity:', identity);
      } catch (error) {
        console.error('🔧 Error loading user identity:', error);
        setUserIdentity(null);
      } finally {
        setIsLoadingIdentity(false);
      }
    };

    loadUserIdentity();
  }, [address, balances, tokenLoading]);

  // Load accessible items
  useEffect(() => {
    const loadItems = async () => {
      if (!address || !userIdentity) return;

      try {
        const accessibleItems = await getAccessibleItemsForUser(
          allItems, // Your full items array
          address,
          balances
        );
        setItems(accessibleItems);
        console.log(`🔧 Loaded ${accessibleItems.length} accessible items`);
      } catch (error) {
        console.error('🔧 Error loading items:', error);
      }
    };

    loadItems();
  }, [userIdentity, address, balances]);

  // Show loading state
  if (isLoadingIdentity || tokenLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-center">
          🔧 Loading your feature...
        </div>
      </div>
    );
  }

  // Show access denied
  if (!userIdentity) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-center">
          🔐 Connect your wallet to access this feature
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Your Feature</h1>
      {items.length === 0 ? (
        <p>No items available with your current permissions</p>
      ) : (
        items.map(item => (
          <YourItemComponent key={item.id} item={item} />
        ))
      )}
    </div>
  );
}
```

### Step 4: API Route Integration

For API routes that need access control:

```typescript
// src/app/api/your-feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdentity } from '@/utils/accessControlUtils';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('address');
  
  if (!userAddress) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  try {
    // Get user identity
    const tokenBalances = await fetchTokenBalances(userAddress);
    const userIdentity = await getUserIdentity(userAddress, tokenBalances);
    
    // Check access
    if (!canUserAccessFeature(userIdentity)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Return accessible data
    const accessibleItems = await getAccessibleItemsForUser(
      allItems,
      userAddress,
      tokenBalances
    );

    return NextResponse.json({ items: accessibleItems });
  } catch (error) {
    console.error('🔧 API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## 📋 Token Mapping Reference

### Standard Token IDs (Database)
```typescript
// Normalized token IDs used in database
'exec'         → Executive Pod (HAT)
'dev'          → Developer Pod (HAT)  
'bounty'       → Bounty Manager (HAT)
'curiosity'    → Proof of Curiosity (ERC-721)
'market_admin' → Market Admin (HAT)
'self'         → SELF Token (ERC-20)
'system'       → SYSTEM Token (ERC-20)
```

### Environment Variable Mapping (Legacy)
```typescript
// Still supported for backward compatibility
process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY → hasProofOfCuriosity
process.env.NEXT_PUBLIC_SELF_TOKEN         → selfBalance > 0
process.env.NEXT_PUBLIC_SYSTEM_TOKEN       → systemBalance > 0
process.env.NEXT_PUBLIC_MARKET_MANAGEMENT  → hasMarketManagement
```

---

## ✅ Integration Checklist

When adding a new feature, ensure you:

- [ ] Create feature-specific access control functions
- [ ] Use `getUserIdentity()` for normalized access checking
- [ ] Integrate with `useTokenBalances()` context
- [ ] Add proper loading states while identity loads
- [ ] Include error handling for identity resolution failures
- [ ] Add debug logging with feature emoji (🔧, 🎪, 🏛️, etc.)
- [ ] Create database link tables if server-side access control needed
- [ ] Write RPC functions for complex access rules
- [ ] Follow the established naming conventions
- [ ] Test with different user permission combinations

---

## 🎯 Existing Feature Examples

### Successfully Integrated Features:
- **Forums** 🏛️ - `forums_accessible_by_identity` RPC
- **Events** 🎪 - `events_accessible_by_identity` RPC  
- **Chat** 💬 - HAT-based chat groups
- **Marketplace** 🛍️ - Product access control
- **Governance** 🗳️ - Proposal participation rules
- **Bounties** 💰 - Multi-token bounty access
- **Shopping Cart** 🛒 - Product filtering & pricing
- **Pods** 🏢 - Advanced HAT system integration

### Reference Implementation:
Look at any of these features for complete integration examples, especially:
- `src/features/shopping-cart/` (latest integration)
- `src/features/forums/` (RPC-based access control)
- `src/features/events/` (comprehensive HAT integration)

---

## 🚀 Best Practices

1. **Always normalize addresses** to lowercase
2. **Use centralized contexts** instead of individual API calls
3. **Implement proper loading states** while identity resolves
4. **Add comprehensive error handling** for network failures
5. **Include debug logging** with consistent emoji patterns
6. **Follow the established token mapping** conventions
7. **Create server-side RPC functions** for complex access rules
8. **Test with different permission combinations** during development

---

This identity system provides a robust, scalable foundation for access control across your entire DAO application while maintaining consistency and performance. 🎯✨