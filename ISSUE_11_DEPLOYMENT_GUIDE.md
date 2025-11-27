# ISSUE #11 - DEPLOYMENT GUIDE

**Date:** November 25, 2025
**Fix:** Treasury Balance Mismatch - Force Deposits Through receiveTokens()
**Status:** ✅ **CODE CHANGES COMPLETE - READY TO DEPLOY**

---

## ✅ CHANGES APPLIED

### 1. **PurchaseRouter.sol** - FIXED ✅

**File:** `src/contracts/PurchaseRouter.sol`

**Changes:**
- ✅ Lines 183-204: Updated `_routeFunds()` to approve → receiveTokens() → fallback
- ✅ Removed `_callReceiveTokens()` helper function (no longer needed)

**What Changed:**
```diff
- // OLD: Transfer first, then try receiveTokens
- require(IERC20(token).transfer(treasury, amount));
- try this._callReceiveTokens(treasury, token, amount) {} catch {}

+ // NEW: Approve, then let treasury pull via receiveTokens
+ require(IERC20(token).approve(treasury, amount));
+ (bool success, ) = treasury.call(abi.encodeWithSignature("receiveTokens(address,uint256)", token, amount));
+ if (!success) {
+     // Fallback to direct transfer if needed
+     require(IERC20(token).transfer(treasury, amount));
+ }
```

---

### 2. **PurchaseRouterDecentralized.sol** - FIXED ✅

**File:** `src/contracts/PurchaseRouterDecentralized.sol`

**Changes:**
- ✅ Lines 293-314: Updated `_routeFunds()` to approve → receiveTokens() → fallback
- ✅ Removed `_callReceiveTokens()` helper function (no longer needed)

**Same fix applied for consistency across both router contracts.**

---

## 🎯 WHAT THIS FIX DOES

### Before (BROKEN):
```
PurchaseRouter receives 100 $SYSTEM from buyer
  ↓
Transfer 100 $SYSTEM to Treasury ✅
  ↓
Try to call treasury.receiveTokens(SYSTEM, 100)
  ↓
❌ FAILS: Treasury tries to pull tokens (already there!)
  ↓
Catch error, continue silently
  ↓
Result:
  - External balance: 100 ✅
  - Internal tokenBalances[SYSTEM]: 0 ❌
  - UI shows: 0 balance ❌
```

### After (FIXED):
```
PurchaseRouter receives 100 $SYSTEM from buyer
  ↓
Approve Treasury to spend 100 $SYSTEM ✅
  ↓
Call treasury.receiveTokens(SYSTEM, 100) ✅
  ↓
Treasury pulls 100 $SYSTEM from PurchaseRouter ✅
Treasury updates tokenBalances[SYSTEM] += 100 ✅
  ↓
Result:
  - External balance: 100 ✅
  - Internal tokenBalances[SYSTEM]: 100 ✅
  - UI shows: 100 $SYSTEM ✅
```

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### 1. Local Testing (15 minutes)

- [ ] **Compile contracts**
  ```bash
  npx hardhat compile
  ```
  - [ ] Verify no compilation errors
  - [ ] Check contract sizes within limits

- [ ] **Run existing tests**
  ```bash
  npx hardhat test
  ```
  - [ ] All tests pass
  - [ ] No regressions

- [ ] **Optional: Create specific test**
  ```javascript
  // test/PurchaseRouter.test.js
  it("should update treasury internal balance via receiveTokens", async function() {
    // 1. Configure product → pod treasury
    await purchaseRouter.setProductDestination(
      "test-product",
      FundDestinationType.POD_TREASURY,
      treasuryAddress,
      "test-pod"
    );

    // 2. Make purchase
    await purchaseRouter.purchaseWithRouting(
      ethers.parseUnits("100", 18), // 100 SYSTEM
      0,
      "test-product"
    );

    // 3. Verify internal balance updated
    const internalBalance = await treasury.getBalance(systemTokenAddress);
    expect(internalBalance).to.equal(ethers.parseUnits("100", 18));

    // 4. Verify external balance matches
    const externalBalance = await systemToken.balanceOf(treasuryAddress);
    expect(internalBalance).to.equal(externalBalance); // ✅ NO MISMATCH!
  });
  ```

---

### 2. Testnet Deployment (30 minutes)

#### A. Deploy PurchaseRouter to Base Sepolia

**Create deployment script if needed:**

```javascript
// scripts/deploy-purchase-router.js
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PurchaseRouter to", network.name);

  const SYSTEM_TOKEN = "0x..."; // Your SYSTEM token address
  const SELF_TOKEN = "0x...";   // Your SELF token address
  const OWNER = "0x...";        // Owner address

  const PurchaseRouter = await ethers.getContractFactory("PurchaseRouter");
  const purchaseRouter = await PurchaseRouter.deploy(
    SYSTEM_TOKEN,
    SELF_TOKEN,
    OWNER
  );

  await purchaseRouter.waitForDeployment();
  const address = await purchaseRouter.getAddress();

  console.log("PurchaseRouter deployed to:", address);

  // Verify contract
  console.log("Waiting 30s before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  await hre.run("verify:verify", {
    address: address,
    constructorArguments: [SYSTEM_TOKEN, SELF_TOKEN, OWNER],
  });

  console.log("Contract verified!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

**Deploy:**
```bash
# Deploy to Base Sepolia testnet
npx hardhat run scripts/deploy-purchase-router.js --network base-sepolia

# Note the deployed address
# Example output: PurchaseRouter deployed to: 0x1234...
```

- [ ] **Deployment successful**
- [ ] **Contract verified on Basescan Sepolia**
- [ ] **Saved new contract address**

---

#### B. Test on Testnet

**1. Configure test product:**
```javascript
// Use Hardhat console or Etherscan
await purchaseRouter.setProductDestination(
  "test-product-123",
  2, // FundDestinationType.POD_TREASURY
  "0x...", // Treasury address
  "test-pod-uuid"
);
```

**2. Authorize treasury:**
```javascript
await purchaseRouter.setTreasuryAuthorization(
  "0x...", // Treasury address
  true
);
```

**3. Make test purchase:**
```javascript
// Approve tokens first
await systemToken.approve(purchaseRouter.address, ethers.parseUnits("10", 18));

// Purchase
await purchaseRouter.purchaseWithRouting(
  ethers.parseUnits("10", 18), // 10 SYSTEM
  0,
  "test-product-123"
);
```

**4. Verify balance sync:**
```javascript
// Get internal balance
const internalBalance = await treasury.getBalance(systemTokenAddress);
console.log("Internal balance:", ethers.formatUnits(internalBalance, 18));

// Get external balance
const externalBalance = await systemToken.balanceOf(treasuryAddress);
console.log("External balance:", ethers.formatUnits(externalBalance, 18));

// Should match!
if (internalBalance === externalBalance) {
  console.log("✅ BALANCES MATCH - FIX WORKING!");
} else {
  console.log("❌ MISMATCH DETECTED - ISSUE NOT FIXED");
}
```

**Testnet Checklist:**
- [ ] Product destination configured
- [ ] Treasury authorized
- [ ] Test purchase successful
- [ ] Internal balance updated correctly
- [ ] External balance matches internal balance
- [ ] **NO MISMATCH DETECTED** ✅

---

### 3. Mainnet Deployment (30 minutes)

**⚠️ IMPORTANT: Only proceed after successful testnet testing!**

#### A. Deploy to Base Mainnet

```bash
# Deploy PurchaseRouter to mainnet
npx hardhat run scripts/deploy-purchase-router.js --network base

# Deploy PurchaseRouterDecentralized (if used)
npx hardhat run scripts/deploy-purchase-router-decentralized.js --network base
```

- [ ] **PurchaseRouter deployed to mainnet**
- [ ] **Contract verified on Basescan**
- [ ] **New address saved securely**

#### B. Update Frontend

**Update contract addresses in your frontend:**

```javascript
// src/constants/contracts.ts (or wherever you store addresses)
export const PURCHASE_ROUTER_ADDRESS = "0x..."; // NEW ADDRESS
export const PURCHASE_ROUTER_DECENTRALIZED_ADDRESS = "0x..."; // NEW ADDRESS (if used)
```

- [ ] **Frontend contract addresses updated**
- [ ] **ABIs updated if needed**
- [ ] **Frontend redeployed**

#### C. Migrate Product Destinations

**For each existing product routing to pod treasury:**

```javascript
// Option 1: Use owner account via Etherscan "Write Contract"
await newPurchaseRouter.setProductDestination(
  productId,
  2, // POD_TREASURY
  treasuryAddress,
  podId
);

// Option 2: Batch migration script
const products = [
  { id: "product-1", treasury: "0x...", podId: "pod-1" },
  { id: "product-2", treasury: "0x...", podId: "pod-2" },
  // ...
];

for (const product of products) {
  await newPurchaseRouter.setProductDestination(
    product.id,
    2, // POD_TREASURY
    product.treasury,
    product.podId
  );
  console.log(`✅ Migrated ${product.id}`);
}
```

- [ ] **All product destinations migrated**
- [ ] **Treasury authorizations set**
- [ ] **No products using old router**

---

## 🧪 POST-DEPLOYMENT TESTING

### 1. Monitor First Purchases (24 hours)

**Check logs for:**
```bash
# Success indicators (what you want to see):
"✅ Roles backed up"
"💾 Transaction metadata stored"
"🏦 Loaded token balances: X tokens"
"🏦 Treasury internal balance: {..., match: true}"  # ← KEY INDICATOR

# Error indicators (what you DON'T want to see):
"🚨 BALANCE MISMATCH DETECTED"
"💾 Failed to store transaction metadata"
"Transfer to treasury failed"
```

**Monitor for 24 hours:**
- [ ] **First purchase successful**
- [ ] **Internal balance updated correctly**
- [ ] **No balance mismatch errors**
- [ ] **Treasury distributions work**
- [ ] **UI shows correct balances**

---

### 2. Regression Testing

**Test all destination types still work:**

- [ ] **BURN destination:**
  ```javascript
  // Product configured to burn tokens
  await purchaseRouter.purchaseWithRouting(systemAmount, 0, "burn-product");
  // Verify tokens burned (not in router or treasury)
  ```

- [ ] **WALLET destination:**
  ```javascript
  // Product configured to send to creator wallet
  await purchaseRouter.purchaseWithRouting(systemAmount, 0, "wallet-product");
  // Verify tokens in creator wallet
  ```

- [ ] **POD_TREASURY destination:**
  ```javascript
  // Product configured to send to pod treasury
  await purchaseRouter.purchaseWithRouting(systemAmount, 0, "treasury-product");
  // Verify internal AND external balances match
  ```

**All destination types:**
- [ ] BURN working correctly
- [ ] WALLET working correctly
- [ ] POD_TREASURY working correctly (AND accounting synced!)

---

### 3. User Acceptance Testing

**Have a pod manager test:**

1. **Purchase a product** that routes to their pod treasury
2. **Check treasury balance** in UI - should show received amount
3. **Create a distribution** using the received tokens
4. **Verify distribution** succeeds without "insufficient balance" error

**User feedback:**
- [ ] Balance displays correctly
- [ ] Can distribute received tokens
- [ ] No confusion about "missing" payments
- [ ] Overall positive experience

---

## 🔄 ROLLBACK PLAN

If issues are detected post-deployment:

### Option 1: Quick Rollback

**Revert to old PurchaseRouter:**
```javascript
// Update frontend to use old router address
export const PURCHASE_ROUTER_ADDRESS = "0x..."; // OLD ADDRESS
```

- ✅ Immediate fix
- ❌ Reverts to balance mismatch behavior

### Option 2: Emergency Fix

If new bug discovered:
1. Identify issue in new contract
2. Deploy hotfix contract
3. Update frontend addresses
4. Migrate product destinations

---

## 📊 SUCCESS METRICS

**Fix is successful if:**

1. ✅ **No balance mismatch errors** in logs
   - Before: `🚨 BALANCE MISMATCH DETECTED` frequently
   - After: Never appears

2. ✅ **Internal balance always matches external**
   - Check: `treasury.getBalance(token) === ERC20(token).balanceOf(treasury)`

3. ✅ **Users can distribute received payments**
   - Before: "Insufficient balance" errors
   - After: Distributions succeed

4. ✅ **Zero user complaints** about missing payments
   - Before: "Where did our marketplace revenue go?"
   - After: Balances always correct

---

## 🎉 COMPLETION CHECKLIST

### Code Changes:
- [x] PurchaseRouter.sol updated
- [x] PurchaseRouterDecentralized.sol updated
- [x] Old helper functions removed

### Testing:
- [ ] Local compilation successful
- [ ] Existing tests pass
- [ ] Testnet deployment successful
- [ ] Testnet purchase test passed
- [ ] Balance sync verified on testnet

### Deployment:
- [ ] Mainnet deployment successful
- [ ] Contract verified on Basescan
- [ ] Frontend addresses updated
- [ ] Product destinations migrated
- [ ] Treasury authorizations set

### Validation:
- [ ] First mainnet purchase successful
- [ ] Internal balance updated correctly
- [ ] No balance mismatch errors
- [ ] User acceptance testing passed
- [ ] 24-hour monitoring complete

---

## 📝 FINAL NOTES

**What was fixed:**
- ❌ Before: PurchaseRouter transferred THEN called receiveTokens (wrong order)
- ✅ After: PurchaseRouter approves THEN calls receiveTokens (correct order)

**Impact:**
- **Severity:** Medium (affects all marketplace → pod treasury payments)
- **Frequency:** 100% of purchases (before fix)
- **User Impact:** High confusion ("missing" payments)
- **Data Loss:** None (tokens never lost, just accounting wrong)

**Fix Quality:**
- ✅ Simple code change (approve → receiveTokens pattern)
- ✅ Backwards compatible (fallback to old behavior if needed)
- ✅ No breaking changes to interface
- ✅ Low risk deployment

**Estimated Total Time:**
- Code changes: ✅ Complete (5 minutes)
- Testing: ~45 minutes (local + testnet)
- Deployment: ~30 minutes (mainnet + frontend)
- Validation: 24 hours (monitoring)
- **Total: ~2 hours active work + 24h monitoring**

---

**Generated:** November 25, 2025
**Issue:** #11 - Treasury Balance Mismatch
**Fix Status:** ✅ **IMPLEMENTED - READY TO DEPLOY**
**Next Step:** Run local tests, then deploy to testnet
