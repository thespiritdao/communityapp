# Minting Executive Pod Leader Hat to Service Wallet

Since your admin wallet is a **Coinbase Smart Wallet**, you'll mint the hat using the **Hats Protocol UI** or your **existing admin interface**.

---

## 🎯 **Quick Reference**

**Your Admin Wallet (Coinbase Smart Wallet):**
- Already wears Executive Pod Leader hat ✅
- Can mint new instances of this hat ✅

**Service Wallet:**
- Generated via `tsx scripts/generate-service-wallet.ts`
- Needs Executive Pod Leader hat minted to it
- Will be used by backend to mint Beta Tester hats

---

## 📋 **Option 1: Hats Protocol UI** (Easiest)

### Step 1: Go to Hats Protocol
```
https://app.hatsprotocol.xyz
```

### Step 2: Connect Your Coinbase Wallet
- Click "Connect Wallet"
- Select "Coinbase Wallet"
- Approve the connection

### Step 3: Navigate to Your Tree
- Go to "Trees" → Find your Executive Pod tree
- Should see tree ID 136 (or your tree number)
- Click on "Executive Pod Leader" hat

### Step 4: Mint to Service Wallet
- Click "Mint Hat" or "Add Wearer"
- Paste your **service wallet address**:
  ```
  (Address from generate-service-wallet.ts output)
  ```
- Confirm the transaction in your Coinbase Wallet
- Wait for confirmation

### Step 5: Verify
```bash
tsx scripts/verify-admin-hat.ts
```

Should now show: ✅ Admin wallet WEARS Executive Pod Leader hat

---

## 📋 **Option 2: Direct Contract Interaction**

If you prefer to interact with the contract directly:

### Using Cast (Foundry)
```bash
cast send 0x3bc1a0ad72417f2d411118085256fc53cbddd137 \
  "mintHat(uint256,address)" \
  0x0000008800010000000000000000000000000000000000000000000000000000 \
  <SERVICE_WALLET_ADDRESS> \
  --rpc-url https://mainnet.base.org \
  --private-key <YOUR_CONTROLLING_EOA_KEY>
```

### Using Ethers.js
```javascript
import { ethers } from 'ethers';

const HATS_ADDRESS = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const EXEC_LEADER_HAT = '0x0000008800010000000000000000000000000000000000000000000000000000';
const SERVICE_WALLET = '<SERVICE_WALLET_ADDRESS>';

const hatsABI = [
  'function mintHat(uint256 hatId, address wearer) returns (bool)'
];

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const wallet = new ethers.Wallet('<YOUR_ADMIN_PRIVATE_KEY>', provider);
const hats = new ethers.Contract(HATS_ADDRESS, hatsABI, wallet);

const tx = await hats.mintHat(EXEC_LEADER_HAT, SERVICE_WALLET);
await tx.wait();
console.log('✅ Hat minted:', tx.hash);
```

---

## 📋 **Option 3: Via Your DAO's Safe Multisig**

If your DAO uses a Safe multisig:

### Step 1: Create Transaction Proposal
```
To: 0x3bc1a0ad72417f2d411118085256fc53cbddd137 (Hats Protocol)
Function: mintHat(uint256 hatId, address wearer)
Parameters:
  - hatId: 0x0000008800010000000000000000000000000000000000000000000000000000
  - wearer: <SERVICE_WALLET_ADDRESS>
```

### Step 2: Sign and Execute
- Get required signatures from multisig members
- Execute the transaction
- Wait for confirmation

---

## 🔍 **Troubleshooting**

### "NotAdmin" Error
**Cause:** Your Coinbase Smart Wallet doesn't wear the Executive Pod Leader hat

**Fix:** First mint the hat to your Coinbase Smart Wallet, then mint to service wallet

### "AllHatsWorn" Error
**Cause:** Maximum supply of Executive Pod Leader hats reached

**Fix:** Increase maxSupply via Hats Protocol UI (requires admin)

### "AlreadyWearingHat" Error
**Cause:** Service wallet already has the hat

**Fix:** Nothing needed! This means it's already set up correctly ✅

---

## ✅ **Verification**

After minting, verify everything is correct:

```bash
# Check service wallet has the hat
tsx scripts/verify-admin-hat.ts

# Expected output:
# ✅ Admin wallet WEARS Executive Pod Leader hat
```

---

## 🎯 **What This Achieves**

```
Your Coinbase Smart Wallet (You control via UI)
  └─> Executive Pod Leader Hat
       ├─> Your Coinbase Wallet (existing wearer) ✅
       └─> Service Wallet (new wearer) ✅
            └─> Used by backend to mint Beta Tester hats
```

Now your backend can mint hats automatically while you maintain full admin control through your Coinbase wallet! 🎉
