# 🔄 Tokens vs Pods Table Migration Guide

## 🎯 **Goal: Clean Table Separation**

Separate concerns between `tokens` and `pods` tables to eliminate redundancy and clarify data architecture.

## 📊 **Current State Problems**

1. **Schema Inconsistency**: Events table references `tokens` for pod relationships, but code uses `pods` table
2. **Data Redundancy**: Pod access tokens exist in both tables with different purposes
3. **Confusion**: Mixing community currencies with pod access control in same table

## 🏗️ **Target State**

### **tokens** table (Community Currencies & Membership)
```sql
-- ONLY contains:
- $SYSTEM token (community currency)
- $SELF token (community currency)  
- Advocate token (membership/proof-of-humanity)
- Proof of Curiosity token (membership)
```

### **pods** table (Pod Management & HAT Access)
```sql
-- Contains all pod entities with:
- management_hat_id (for pod administration)
- membership_hat_id (for pod access)
- treasury_contract_address (for fund management)
```

## 🚀 **Migration Steps**

### **Step 1: Fix Events Schema References**
```bash
# Run this SQL script first:
src/features/events/fix-events-schema-references.sql
```

**What it does:**
- Changes foreign key constraints from `tokens` to `pods` table
- Updates event references to use correct pod IDs

### **Step 2: Clean Up Tokens Table**
```bash  
# Run this SQL script after Step 1:
src/features/pods/sql/clean-tokens-table.sql
```

**What it does:**
- Removes pod access tokens (`exec`, `community`) from tokens table
- Keeps only community currencies and membership tokens

### **Step 3: Update Application Code**

**New Service: `PodAccessService`**
- Replaces token-based pod access with HAT-based access
- Provides methods to check pod permissions via HATS Protocol
- Located: `src/utils/podAccessService.ts`

**Updated: `TokenService`**
- Now focused only on community currencies and membership tokens
- Removed pod-specific token logic
- Updated descriptions and comments

## 🔧 **Breaking Changes & Fixes**

### **Events System**
**Before:**
```typescript
// Events referenced pod tokens from tokens table
organizing_pod_id: 'exec' // From tokens table
```

**After:**  
```typescript
// Events reference actual pods
organizing_pod_id: '86d2d359-2e38-4267-b7b7-c7f6155063e2' // From pods table
```

### **Pod Access Checks**
**Before:**
```typescript
// Token-based access check
const hasAccess = await checkTokenBalance(userAddress, 'exec');
```

**After:**
```typescript  
// HAT-based access check
const access = await PodAccessService.checkPodAccess(publicClient, userAddress, podId);
const hasAccess = access.hasManagementAccess || access.hasMembershipAccess;
```

## ⚠️ **Important Notes**

1. **Run SQL scripts in order** - events schema must be fixed before cleaning tokens table
2. **Backup your data** before running migration scripts
3. **Update any existing events** that reference old token IDs to use pod UUIDs
4. **Test pod access** functionality after migration to ensure HAT-based permissions work

## 🧪 **Testing Checklist**

- [ ] Events can be created with pod associations
- [ ] Pod access control works via HATS Protocol  
- [ ] Token requirements work for membership tokens only
- [ ] Community currencies ($SELF, $SYSTEM) function correctly
- [ ] No broken references between tables

## 📁 **Files Modified**

- `src/utils/tokenService.ts` - Updated for currency/membership focus
- `src/utils/podAccessService.ts` - New HAT-based access service  
- `src/features/events/fix-events-schema-references.sql` - Schema fixes
- `src/features/pods/sql/clean-tokens-table.sql` - Token cleanup
- `src/features/pods/MIGRATION_GUIDE.md` - This guide

## 🎯 **Benefits After Migration**

1. **Clear Separation**: Currencies vs Pod Management
2. **Consistent Schema**: Database matches application logic  
3. **HAT Integration**: Proper HATS Protocol usage for pod access
4. **Maintainable**: Easier to understand and modify going forward
5. **Scalable**: Better foundation for future pod features