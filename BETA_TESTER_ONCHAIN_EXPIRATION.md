# Beta Tester On-Chain Expiration Implementation

**Date:** January 5, 2026
**Status:** ✅ **READY FOR TESTING**
**Type:** Gasless Transaction (Coinbase Paymaster Sponsored)

---

## 🎯 **What Was Implemented**

A complete system to enforce Beta Tester HAT expiration **on-chain** using the TimeBasedToggleModule smart contract. This ensures users cannot bypass the time restriction.

### **Key Features**

1. ✅ **Database Update**: Time restriction saved to `pod_role_permissions` table
2. ✅ **On-Chain Enforcement**: Expiration committed to TimeBasedToggleModule contract
3. ✅ **Gasless Transaction**: Sponsored by Coinbase paymaster (no ETH required)
4. ✅ **Automatic Deactivation**: HAT becomes inactive after expiration timestamp
5. ✅ **User-Friendly UI**: Clear explanations and easy workflow

---

## 📦 **Files Created/Modified**

### **1. Created: `SetHatExpirationButton.tsx`**

**Location**: `src/features/pods/components/SetHatExpirationButton.tsx`

**Purpose**: CDP Smart Account button to set HAT expiration on-chain (gasless)

**Key Features**:
- Uses `useSendUserOperation` for gasless transactions
- Calls `TimeBasedToggleModule.setHatExpiration()`
- Encodes contract call using `encodeFunctionData`
- Uses Coinbase paymaster (`useCdpPaymaster: true`)
- Works on Base mainnet (`network: 'base'`)

**Code Structure**:
```typescript
export function SetHatExpirationButton({
  hatId,              // Beta Tester HAT ID
  expirationTimestamp, // Unix timestamp in seconds
  onSuccess,          // Callback after success
})
```

---

### **2. Modified: `UnifiedMembershipManager.tsx`**

**Location**: `src/features/pods/components/UnifiedMembershipManager.tsx`

**Changes**:
1. **Imported** `SetHatExpirationButton` component
2. **Added state**:
   - `showBetaTesterExpiration`: Controls visibility of expiration UI
   - `betaTesterExpirationTimestamp`: Stores the expiration timestamp
3. **Modified `handleSaveToDatabase()`**:
   - Detects Beta Tester role saves
   - Extracts expiration from `eligibility_criteria`
   - Shows on-chain commit button
4. **Added UI section**:
   - Card with expiration details
   - Explanation of on-chain enforcement
   - SetHatExpirationButton
   - "Skip" option for database-only mode

---

### **3. Modified: `layout.tsx`**

**Location**: `src/app/layout.tsx`

**Changes**:
- Added `WalletAuthSync` component for automatic Supabase authentication
- Ensures JWT contains `wallet_address` for RLS policies

---

## 🔧 **Configuration**

### **Environment Variables Required**

```bash
# .env file must contain:
NEXT_PUBLIC_BETA_TESTER_HAT=0x000000880001000b000000000000000000000000000000000000000000000000
NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE=0xDABE0119fBC7eA5821283dB666C8701049351D95
```

**Verification**:
- ✅ Beta Tester HAT ID configured
- ✅ TimeBasedToggleModule deployed and configured

---

## 🚀 **How It Works**

### **Step-by-Step Flow**

#### **1. User Edits Beta Tester Criteria**

User navigates to:
```
/pods/e35c9e25-d29f-4988-b1e8-2902e960b94c
→ Controls Tab
→ Beta Tester
→ Access Requirements
→ Add/Edit Time Restriction
```

#### **2. User Saves to Database**

- Clicks "Save Configuration"
- Database record updated in `pod_role_permissions`
- System detects Beta Tester role
- Extracts expiration timestamp from criteria

#### **3. System Shows On-Chain Commit UI**

A card appears with:
- **Title**: "Commit Expiration to Blockchain"
- **Expiration Date**: Displays the date
- **Explanation**: Why on-chain enforcement matters
- **Button**: "Commit Expiration to Token (Gasless)"
- **Skip Option**: "Skip On-Chain Commit (Database Only)"

#### **4. User Clicks Commit Button**

**Transaction Details**:
```typescript
{
  contract: TimeBasedToggleModule (0xDABE0119fBC7eA5821283dB666C8701049351D95)
  function: setHatExpiration(hatId, expirationTimestamp)
  args: [
    0x000000880001000b000000000000000000000000000000000000000000000000, // Beta Tester HAT
    1767225600 // Unix timestamp for expiration
  ]
  network: Base Mainnet
  paymaster: Coinbase (gasless)
  signer: CDP Smart Account
}
```

#### **5. Success**

- Toast notification: "Expiration Set On-Chain! (Gasless)"
- HAT will now automatically deactivate at expiration timestamp
- UI returns to normal state

---

## 🧪 **Testing Instructions**

### **Prerequisites**

1. ✅ Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. ✅ Ensure you're connected with Executive Pod Leader wallet
3. ✅ Verify you see authentication logs in console:
   ```
   🔄 WalletAuthSync: Syncing wallet with Supabase...
   ✅ WalletAuthSync: Authentication successful
   ```

### **Test Procedure**

#### **Step 1: Navigate to Executive Pod**

```
URL: /pods/e35c9e25-d29f-4988-b1e8-2902e960b94c
```

#### **Step 2: Edit Beta Tester Criteria**

1. Click **Controls** tab
2. Find **Beta Tester** role
3. Click **Access Requirements** tab
4. Add or edit **Time Restriction**:
   - **After** (start date): Leave empty or set to past date
   - **Before** (expiration date): Set to ~1 month from now (e.g., Feb 5, 2026)
5. Click **Save Configuration**

**Expected**: Database saves successfully

#### **Step 3: Commit to Blockchain**

After saving, you should see a new card appear:

**Card Contents**:
- 📅 Calendar icon
- Title: "Commit Expiration to Blockchain"
- Expiration date displayed
- List of benefits (enforcement, auto-deactivation, etc.)
- **Green button**: "Commit Expiration to Token (Gasless)"
- **Outline button**: "Skip On-Chain Commit (Database Only)"

**Action**: Click **"Commit Expiration to Token (Gasless)"**

#### **Step 4: Monitor Console Logs**

You should see:
```
⏰ Setting HAT expiration on-chain (gasless)...
💼 Smart Account: { ... }
🎩 HAT ID: 0x000000880001000b000000000000000000000000000000000000000000000000
📅 Expiration: 2026-02-05T00:00:00.000Z
🏠 Toggle Module: 0xDABE0119fBC7eA5821283dB666C8701049351D95
⛽ Paymaster: ENABLED (gasless transaction)
📝 Encoded call data: 0x...
✅ Expiration set successfully!
```

#### **Step 5: Verify Success**

**In-App**:
- Toast notification appears: "Expiration Set On-Chain! (Gasless)"
- Card disappears
- UI returns to normal

**On-Chain Verification** (optional):
1. Go to BaseScan: https://basescan.org/address/0xDABE0119fBC7eA5821283dB666C8701049351D95
2. Look for recent `setHatExpiration` transaction
3. Check transaction is from your Smart Account
4. Verify transaction was gasless (paid by paymaster)

---

## 🔍 **Troubleshooting**

### **Error: "Wallet Not Connected"**

**Solution**: Refresh the page and ensure CDP Smart Wallet is connected

### **Error: "Module Not Configured"**

**Solution**: Check that `NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE` is set in `.env`

### **Error: "Transaction Failed"**

**Possible Causes**:
1. **Not authorized**: Only Executive Pod leaders can call `setHatExpiration`
2. **Contract not whitelisted**: TimeBasedToggleModule must be whitelisted with Coinbase paymaster
3. **Network mismatch**: Ensure you're on Base mainnet

**Solution**: Check console logs for specific error message

### **Button Doesn't Appear After Saving**

**Possible Causes**:
1. **No time restriction set**: The expiration timestamp is 0 or not set
2. **Role name mismatch**: System looks for "Beta Tester" in role name

**Solution**:
- Ensure time restriction is configured in Access Requirements
- Check console for: `⏰ Found time_based expiration: ...`

---

## 📊 **Verification Queries**

### **Check Database Update**

```sql
SELECT
  role_name,
  eligibility_criteria,
  updated_at,
  updated_by
FROM pod_role_permissions
WHERE role_name = 'Beta Tester'
  AND pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
```

**Expected**:
- `eligibility_criteria` contains `time_based` criterion with `beforeTimestamp`
- `updated_at` is recent
- `updated_by` is your wallet address

### **Check On-Chain Expiration** (Using Smart Contract)

You can read the expiration from the TimeBasedToggleModule contract:

```typescript
// Using viem
const expiration = await publicClient.readContract({
  address: '0xDABE0119fBC7eA5821283dB666C8701049351D95',
  abi: TimeBasedToggleModuleABI,
  functionName: 'getHatTimeWindow',
  args: [BigInt('0x000000880001000b000000000000000000000000000000000000000000000000')],
});

console.log('Expiration:', new Date(Number(expiration[1]) * 1000));
```

---

## 🎯 **Expected Behavior After Implementation**

### **Before Expiration Date**

- Beta Tester HAT is **active**
- Users with HAT can access beta features
- `getHatStatus()` returns `true`

### **After Expiration Date**

- Beta Tester HAT is **inactive** (automatic)
- Users with HAT **cannot** access beta features
- `getHatStatus()` returns `false`
- HAT still exists in wallet but is deactivated

### **Database vs On-Chain**

| Aspect | Database Only | On-Chain Enforcement |
|--------|--------------|---------------------|
| **Expiration Stored** | ✅ Yes | ✅ Yes |
| **UI Shows Expiration** | ✅ Yes | ✅ Yes |
| **Smart Contract Enforced** | ❌ No | ✅ **Yes** |
| **Bypassing Possible** | ⚠️ Yes | ❌ **No** |
| **Gas Cost** | Free | Free (paymaster) |
| **Security** | UI-only | Cryptographic |

---

## 🔐 **Security Considerations**

### **Who Can Set Expiration?**

Only addresses with **admin permissions** on the TimeBasedToggleModule can call `setHatExpiration()`.

**Your Setup**:
- Executive Pod Leaders can set expirations
- Requires on-chain permission check
- Coinbase paymaster sponsors gas for whitelisted contracts

### **Can Users Bypass Expiration?**

**With Database-Only**: ⚠️ Yes
- Users could call contracts directly, bypassing UI checks

**With On-Chain Enforcement**: ❌ No
- HAT becomes cryptographically inactive
- No way to bypass smart contract logic
- Enforced at protocol level by Hats Protocol

---

## 📝 **Next Steps**

1. ✅ **Test the implementation** following the testing instructions
2. ⏳ **Set actual expiration date** for beta testing period
3. ⏳ **Monitor beta testers** as expiration approaches
4. ⏳ **Extend or create new HAT** when beta testing period ends

---

## 🎉 **Benefits of This Implementation**

1. ✅ **Secure**: Cryptographically enforced expiration
2. ✅ **User-Friendly**: Simple workflow with clear explanations
3. ✅ **Gasless**: No ETH required (Coinbase paymaster)
4. ✅ **Automatic**: HAT deactivates at expiration (no manual revocation)
5. ✅ **Flexible**: Can extend expiration by calling `setHatExpiration()` again
6. ✅ **Transparent**: All actions recorded on-chain with transaction hashes

---

**Generated with** 🤖 [Claude Code](https://claude.com/claude-code)
