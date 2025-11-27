# Treasury Multi-Sig Deployment Guide

**Status:** Ready for deployment
**Contracts Updated:** PodTreasuryFactory.sol now deploys PodTreasuryV2WithVoting

---

## ✅ WHAT WAS FIXED

### PodTreasuryFactory.sol Changes:

1. **Import updated** (line 8):
   ```solidity
   // OLD
   import "./PodTreasuryV2.sol";

   // NEW
   import "./PodTreasuryV2WithVoting.sol";
   ```

2. **deployTreasury() updated** - Added `testingMode` parameter:
   ```solidity
   // OLD signature
   function deployTreasury(
       string memory podId,
       uint256 managementHatId,
       address[] memory supportedTokens
   )

   // NEW signature
   function deployTreasury(
       string memory podId,
       uint256 managementHatId,
       address[] memory supportedTokens,
       bool testingMode  // <-- NEW PARAMETER
   )
   ```

3. **Deployment call updated** (line 75-82):
   ```solidity
   // OLD
   PodTreasuryV2 treasury = new PodTreasuryV2{salt: salt}(
       hatsContract,
       managementHatId,
       podId,
       tokens,
       authorizedProxy
   );

   // NEW
   PodTreasuryV2WithVoting treasury = new PodTreasuryV2WithVoting{salt: salt}(
       hatsContract,
       managementHatId,
       podId,
       tokens,
       authorizedProxy,
       testingMode  // <-- NEW PARAMETER
   );
   ```

4. **batchDeployTreasuries() updated** - Added `testingMode` parameter

5. **registerExistingTreasury() updated** - Uses PodTreasuryV2WithVoting type

6. **predictTreasuryAddress() updated** - Added `testingMode` parameter

---

## 📦 CONTRACTS TO DEPLOY IN REMIX

You need to deploy these 2 contracts in order:

### Step 1: Deploy TreasuryProxy

**Contract:** `TreasuryProxy.sol`

**Constructor Parameters:**
```solidity
_treasuryFactory: <TEMPORARY_ADDRESS> // Use 0x0000000000000000000000000000000000000001 for now
_owner: <YOUR_WALLET_ADDRESS>
```

**Save the deployed address:**
```
TREASURY_PROXY_ADDRESS = 0x...
```

### Step 2: Deploy PodTreasuryFactory

**Contract:** `PodTreasuryFactory.sol`

**Constructor Parameters:**
```solidity
_hatsContract: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137  // Hats Protocol on Base
_defaultSupportedTokens: [
    <SYSTEM_TOKEN_ADDRESS>,
    <SELF_TOKEN_ADDRESS>
]
_owner: <YOUR_WALLET_ADDRESS>
_authorizedProxy: <TREASURY_PROXY_ADDRESS from Step 1>
```

**Save the deployed address:**
```
POD_TREASURY_FACTORY_ADDRESS = 0x...
```

### Step 3: Update TreasuryProxy Factory Reference

**Call on TreasuryProxy:**
```solidity
updateTreasuryFactory(POD_TREASURY_FACTORY_ADDRESS)
```

This connects the proxy to the factory.

---

## 🔐 COINBASE PAYMASTER WHITELIST

### Whitelist the TreasuryProxy Address

You need to whitelist: `TREASURY_PROXY_ADDRESS`

### Whitelist ALL 11 Functions

Copy/paste these exact function signatures to Coinbase Paymaster:

```
proxyDistributeTokens(string,address,address[],uint256[],string)
proxyDistributeTokensEvenly(string,address,address[],uint256,string)
proxyReceiveTokens(string,address,uint256)
proxyEmergencyWithdraw(string,address,address,uint256)
proxyDistributeSingle(string,address,address,uint256,string)
proxyAddSupportedToken(string,address)
proxySyncTokenBalance(string,address)
proxySetAuthorizedProxy(string,address)
proxyProposeDistribution(string,address,address[],uint256[],string)
proxyApproveProposal(string,uint256)
proxyCancelProposal(string,uint256)
```

---

## 🧪 HOW TO USE THE NEW FACTORY

### Creating a New Pod Treasury (Testing Mode)

```typescript
// Frontend call to factory
const tx = await podTreasuryFactory.deployTreasury(
  podId,           // "my-test-pod-uuid"
  managementHatId, // Hat ID for pod managers
  supportedTokens, // Array of token addresses (or empty array for defaults)
  true             // testingMode = TRUE for development
);
```

**Result:**
- Treasury deployed with single-sig mode
- Any manager can distribute tokens directly
- Proposals still work but aren't required

### Creating a New Pod Treasury (Production Mode)

```typescript
// Frontend call to factory
const tx = await podTreasuryFactory.deployTreasury(
  podId,           // "my-production-pod-uuid"
  managementHatId, // Hat ID for pod managers
  supportedTokens, // Array of token addresses (or empty array for defaults)
  false            // testingMode = FALSE for production
);
```

**Result:**
- Treasury deployed with multi-sig mode
- All distributions require proposals + majority approval
- Secure for production use

---

## 🔄 FRONTEND INTEGRATION

### Update Your Pod Creation Code

**Find your pod creation hook/function** (likely in `src/features/pods/`):

**Before:**
```typescript
const createTreasuryTx = await factory.deployTreasury(
  podId,
  managementHatId,
  supportedTokens
);
```

**After:**
```typescript
const isTestingMode = process.env.NEXT_PUBLIC_PODS_TESTING === 'true';

const createTreasuryTx = await factory.deployTreasury(
  podId,
  managementHatId,
  supportedTokens,
  isTestingMode  // <-- NEW PARAMETER
);
```

---

## 📝 UPDATE ENVIRONMENT VARIABLES

After deployment, update your `.env`:

```bash
# New contract addresses
NEXT_PUBLIC_TREASURY_PROXY=0x...YOUR_NEW_PROXY_ADDRESS
NEXT_PUBLIC_POD_TREASURY_FACTORY=0x...YOUR_NEW_FACTORY_ADDRESS

# Testing mode (set to false for production)
NEXT_PUBLIC_PODS_TESTING=true  # For development/testing
# NEXT_PUBLIC_PODS_TESTING=false  # For production
```

---

## ✅ DEPLOYMENT CHECKLIST

### Pre-Deployment
- [x] PodTreasuryFactory.sol updated to use PodTreasuryV2WithVoting
- [ ] Both contracts compiled successfully in Remix
- [ ] Have Hats Protocol address: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`
- [ ] Have SYSTEM_TOKEN address ready
- [ ] Have SELF_TOKEN address ready
- [ ] Have your wallet address ready

### Deployment Steps
- [ ] Step 1: Deploy TreasuryProxy (save address)
- [ ] Step 2: Deploy PodTreasuryFactory (save address)
- [ ] Step 3: Call updateTreasuryFactory on proxy
- [ ] Step 4: Add TreasuryProxy to Coinbase Paymaster whitelist
- [ ] Step 5: Add all 11 function signatures to whitelist
- [ ] Step 6: Update .env with new addresses

### Testing
- [ ] Create test pod with testingMode=true
- [ ] Verify treasury deploys successfully
- [ ] Test single-sig distribution (should work in testing mode)
- [ ] Create test pod with testingMode=false
- [ ] Test proposal creation
- [ ] Test proposal approval with multiple wallets
- [ ] Verify auto-execution when majority reached

### Production Ready
- [ ] Set NEXT_PUBLIC_PODS_TESTING=false
- [ ] All new pods will use multi-sig by default
- [ ] Database wiped and ready for fresh start

---

## 🎯 KEY DIFFERENCES

### Testing Mode (testingMode = true)
- ✅ Single manager can distribute tokens directly
- ✅ Faster for development testing
- ✅ Can toggle to production mode later
- ⚠️ Less secure - only use for testing

### Production Mode (testingMode = false)
- 🔒 Requires proposals + majority approval
- 🔒 Simple majority voting (>50%)
- 🔒 Auto-executes when threshold reached
- ✅ Production-ready security

---

## 🚨 IMPORTANT NOTES

1. **Both contracts must be deployed on Base Mainnet** (or Base Sepolia for testing)

2. **TreasuryProxy must be deployed first** because factory needs its address in constructor

3. **You can switch testing mode later** by calling `setTestingMode(false)` on individual treasuries

4. **All 11 functions must be whitelisted** on Coinbase Paymaster for sponsored transactions to work

5. **Frontend code must be updated** to pass the `testingMode` parameter when creating pods

---

## 📞 TROUBLESHOOTING

### "Identifier not found" error in Remix
- Make sure you have both PodTreasuryV2WithVoting.sol AND PodTreasuryFactory.sol in same workspace
- Make sure import path matches: `import "./PodTreasuryV2WithVoting.sol";`

### "Transaction reverted" when creating treasury
- Check that TreasuryProxy.updateTreasuryFactory() was called
- Verify Hats Protocol address is correct
- Ensure pod doesn't already have a treasury

### Multi-sig not working
- Verify testingMode=false was used when deploying
- Check that multiple pod managers exist (need at least 2 for majority)
- Verify Coinbase Paymaster has all 11 functions whitelisted

---

## 🎉 SUCCESS CRITERIA

Your deployment is successful when:

✅ TreasuryProxy deployed successfully
✅ PodTreasuryFactory deployed successfully
✅ Factory connected to proxy via updateTreasuryFactory()
✅ All 11 functions whitelisted on Coinbase Paymaster
✅ Test pod created with testingMode=true
✅ Single-sig distribution works in test pod
✅ Production pod created with testingMode=false
✅ Multi-sig proposal/approval flow works in production pod

**You're then ready for production launch!** 🚀
