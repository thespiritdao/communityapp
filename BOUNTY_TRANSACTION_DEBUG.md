# Bounty Transaction Failure - Debug Guide

## 🔍 Error Analysis

**Error**: `useroperation reverted: execution reverted`
**Stage**: Gas estimation (before actual transaction)
**Meaning**: The transaction would revert if executed

---

## 🎯 Root Cause

The transaction is **correctly using CDP Paymaster** ✅, but the **smart contract call itself is failing** ❌.

### What's Happening:

1. ✅ CDP SDK correctly configured
2. ✅ Paymaster enabled (`useCdpPaymaster: true`)
3. ✅ Smart Account valid
4. ❌ **Gas estimation fails** → contract would revert
5. ❌ CDP rejects transaction before sending

---

## 🔧 Possible Issues

### Issue 1: Contract Mismatch

**Current State**:
- `.env` has: `0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2`
- Code fallback: `0xc2Ac53e7C869Ed9Bcd21b72C7aE747Abb788A8e5`

**Which contract is at `0xF80c...`?**

Run this to check:
```bash
cast code 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2 --rpc-url https://mainnet.base.org | head -c 100
```

If empty → **Contract doesn't exist!**

---

### Issue 2: Wrong Function Signature

**V2 Signature**:
```solidity
function createBounty(
    uint128 value,
    address token,
    uint8 paymentType,
    string calldata podId,
    string calldata ipfsHash
) external returns (uint256)
```

**V3 Signature**:
```solidity
function createBounty(
    uint128 value,
    address token,
    uint8 paymentType,
    string calldata podId,
    string calldata ipfsHash,
    uint256 leaderHatId,      // ← EXTRA
    address treasuryAddress   // ← EXTRA
) external returns (uint256)
```

**Your Code is Calling**: V2 format (5 params)
**Contract Might Be**: V3 (expecting 7 params)

---

### Issue 3: Insufficient Token Balance

**Check User Balance**:
```javascript
// In browser console
const systemToken = '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5';
const userAddress = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48'; // Your smart account

// Check balance (needs web3)
await fetch(`https://mainnet.base.org`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{
      to: systemToken,
      data: '0x70a08231000000000000000000000000' + userAddress.slice(2) // balanceOf(address)
    }, 'latest'],
    id: 1
  })
}).then(r => r.json()).then(console.log);
```

Expected: Balance > bounty amount

---

### Issue 4: Token Not Approved

Even though you're sending `approve()` call, **maybe the token doesn't exist**?

**Check Token Exists**:
```bash
cast code 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5 --rpc-url https://mainnet.base.org | head -c 100
```

---

### Issue 5: Pod Not Registered (V2 Specific)

If using V2, pod might not be registered in `PodBountyService`.

**Check**:
```javascript
// Call PodBountyService.isValidPod(podId)
const podBountyService = '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396';
// Check if pod is registered
```

---

## 🎯 Quick Fixes

### Fix 1: Verify Contract Deployment

```bash
# Check what's at the address
cast code $NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS --rpc-url https://mainnet.base.org
```

If empty or wrong bytecode → **Redeploy or update .env**

---

### Fix 2: Check Which Version is Deployed

Add this to your component:
```typescript
useEffect(() => {
  async function checkContract() {
    const code = await publicClient.getBytecode({
      address: BOUNTY_MANAGER_ADDRESS
    });
    console.log('Contract bytecode length:', code?.length || 0);

    // Try calling a V3-only function
    try {
      await publicClient.readContract({
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BountyManagerV3ABI,
        functionName: 'hatsProtocol'
      });
      console.log('✅ Contract is V3');
    } catch {
      console.log('✅ Contract is V2 (or broken)');
    }
  }
  checkContract();
}, []);
```

---

### Fix 3: Use Correct ABI

If V3 is deployed, ensure you're passing **all 7 parameters**:

```typescript
const bountyCall = createBountyCall(
  formData,
  leaderHatId,      // ← REQUIRED for V3
  treasuryAddress   // ← REQUIRED for V3
);
```

---

### Fix 4: Get Token Balance First

Add to your form:
```typescript
useEffect(() => {
  async function checkBalance() {
    const balance = await publicClient.readContract({
      address: SYSTEM_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [smartAccountAddress]
    });
    console.log('$SYSTEM Balance:', formatEther(balance));

    if (balance < parseEther(formData.value.amount)) {
      setError('Insufficient token balance');
    }
  }
  checkBalance();
}, [formData.value.amount]);
```

---

## 🧪 Step-by-Step Debug

### Step 1: Verify Smart Account
```javascript
console.log('Smart Account:', smartAccount);
console.log('EOA Address:', evmAddress);
```
✅ Should show different addresses

---

### Step 2: Verify Token Addresses
```javascript
console.log('$SYSTEM Token:', SYSTEM_TOKEN_ADDRESS);
console.log('$SELF Token:', SELF_TOKEN_ADDRESS);
```
✅ Should be:
- `SYSTEM`: `0xd67e460ce56be18b573aB434b3DC962c657D8Bb5`
- `SELF`: `0x1b8d424695E63ABca04E94bA46c03f1D83e14020`

---

### Step 3: Verify Bounty Manager
```javascript
console.log('Bounty Manager:', BOUNTY_MANAGER_ADDRESS);
```
✅ Should match `.env`: `0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2`

---

### Step 4: Check Encoded Calls
```javascript
console.log('Encoded Calls:', encodedCalls);
console.log('Call 1 (approve):', {
  to: encodedCalls[0].to,
  value: encodedCalls[0].value,
  data: encodedCalls[0].data.slice(0, 10) // First 10 chars (function selector)
});
console.log('Call 2 (createBounty):', {
  to: encodedCalls[1].to,
  value: encodedCalls[1].value,
  data: encodedCalls[1].data.slice(0, 10)
});
```

Expected:
- Call 1: `approve` → selector `0x095ea7b3`
- Call 2: `createBounty` → V2 selector `0x...` or V3 selector `0x...`

---

### Step 5: Simulate Transaction Locally

Try calling contract directly (without paymaster):
```typescript
try {
  await publicClient.simulateContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [BOUNTY_MANAGER_ADDRESS, amount],
    account: smartAccountAddress
  });
  console.log('✅ Approve would succeed');
} catch (e) {
  console.error('❌ Approve would fail:', e);
}

try {
  await publicClient.simulateContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BOUNTY_MANAGER_ABI,
    functionName: 'createBounty',
    args: bountyArgs,
    account: smartAccountAddress
  });
  console.log('✅ CreateBounty would succeed');
} catch (e) {
  console.error('❌ CreateBounty would fail:', e);
}
```

---

## 🎓 Paymaster Status

**Your CDP Paymaster configuration is CORRECT** ✅

```typescript
await sendUserOperation({
  evmSmartAccount: smartAccount,  // ✅
  network: 'base',                 // ✅
  calls: encodedCalls,             // ✅
  useCdpPaymaster: true,           // ✅
});
```

The error is **not with the paymaster** but with the **transaction itself**.

---

## 🚀 Recommended Next Steps

1. **Check contract at `0xF80c...`**:
   ```bash
   cast code 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2 --rpc-url https://mainnet.base.org
   ```

2. **If no code → Deploy contract**:
   ```bash
   node scripts/deploy-bounty-manager-v3-production.cjs
   # OR
   node scripts/deploy-bounty-manager-v4-configurable.cjs
   ```

3. **Update .env with correct address**

4. **Check token balance**:
   - Do you have $SYSTEM or $SELF tokens?
   - If not → get from faucet or swap

5. **Try with minimal amount first**:
   - Test with 1 token instead of 100
   - Verify transaction succeeds

---

## 📋 Summary

| Component | Status |
|-----------|--------|
| CDP SDK | ✅ Correct |
| Paymaster | ✅ Enabled |
| Smart Account | ✅ Valid |
| Token Addresses | ✅ Correct |
| **Contract Address** | ❓ Needs verification |
| **Token Balance** | ❓ Needs checking |
| **Contract Version** | ❓ V2 vs V3 mismatch? |

**Next Action**: Run Step 1 to verify contract exists and is correct version.
