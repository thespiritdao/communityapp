# Grant Minting Permissions to Advocate NFT Contract via Remix

## Contract Information

- **Contract Address:** `0x592E560171D2a882474cdfc3BbeeDb21cEB4015d`
- **Network:** Base Mainnet (Chain ID: 8453)
- **Admin Wallet (needs minting permission):** `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`

---

## Option 1: Using Remix with ABI (Recommended - No Source Code Needed)

### Step 1: Open Remix & Connect to Base

1. Go to https://remix.ethereum.org
2. Click **Deploy & Run Transactions** tab (left sidebar, looks like Ethereum logo)
3. Set **Environment** to `Injected Provider - MetaMask`
4. MetaMask popup will appear - **select Base Mainnet**
5. Connect the wallet that **owns the Advocate NFT contract**

### Step 2: Load the Contract

1. In the **Deploy & Run Transactions** tab:
   - Find the **Contract** dropdown (should show compiled contracts)
   - You can skip compiling if you just want to interact
2. Under **Deployed Contracts** section at the bottom:
   - Paste the contract address: `0x592E560171D2a882474cdfc3BbeeDb21cEB4015d`
   - Click **At Address** button
3. The contract will appear under **Deployed Contracts**

**Note:** If Remix asks for ABI, copy the entire contents of `src/abis/AdvocateMembershipABI.json` and paste it.

### Step 3: Check Current Owner

1. Expand the deployed contract
2. Find the **owner** function (orange button - view function)
3. Click it
4. Note the address shown - this is who currently owns the contract

### Step 4: Transfer Ownership (if needed)

If you want to give full ownership to the admin wallet:

1. Find **transferOwnership** function (red button - write function)
2. Enter the admin wallet address: `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
3. Click **transact**
4. Confirm the transaction in MetaMask
5. Wait for confirmation

### Step 5: Verify Ownership Transfer

1. Click **owner** function again
2. Verify it shows: `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`

---

## Option 2: Using BaseScan Directly (Even Easier)

### Step 1: Go to Contract Page

Visit: https://basescan.org/address/0x592E560171D2a882474cdfc3BbeeDb21cEB4015d

### Step 2: Read Current Owner

1. Click **Contract** tab
2. Click **Read Contract** sub-tab
3. Find function **21. owner**
4. Click **Query**
5. Note the owner address

### Step 3: Write - Transfer Ownership

1. Click **Write Contract** sub-tab
2. Click **Connect to Web3** button
3. Connect MetaMask with the **current owner wallet**
4. Find function **10. transferOwnership**
5. Enter `newOwner`: `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
6. Click **Write**
7. Confirm transaction in MetaMask

### Step 4: Verify

Go back to **Read Contract** and check **owner** shows the new address.

---

## Option 3: Manual Minting (If You Don't Want to Transfer Ownership)

If you prefer to keep the current owner but just want to mint the NFTs now:

### Via BaseScan:

1. Connect with current owner wallet
2. Go to **Write Contract**
3. Find **mint** function
4. Fill in for each Beta Tester:
   - `to`: Beta Tester wallet address
   - `memberType`: `0` (Standard Member)
   - `uri`: leave empty `""`
5. Click **Write** and confirm transaction
6. Repeat for all 9 Beta Testers

**Beta Tester Addresses Needing NFTs:**

```
0x8a23bde6b8a1832cd7119daed4a794027d74e71e  (Jochen Weber)
0x62421b696132bb635feba0e3cb2f305637cb7ead  (Eric Miki)
0xdfb6614e9de3822e13de08c6b050a448d417b2d6  (Ryan Munn)
0xe3ddfd2b214d51316533181248a4106f83e4934c  (Mariah McKay)
0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48  (Ron Rivers)
0xaecf4d00f0e402fbeb0757f22be9062d89018106  (Tressa Rivers - YOUR TEST ACCOUNT)
0x21498071d1a52830fa398937a9a8f59c69d3fa7a  (Scott Graves)
0x0259c4b65866d8f9e596052dbcdfc142c28b6329  (René Pinnell)
0xbe03115945680f518e53c4473e0e077ec7272923  (Unknown User)
```

---

## After Granting Permissions / Transferring Ownership

Run the airdrop script:

```bash
cd C:\Users\PC\Documents\DAO\App\commapp
npx tsx scripts/airdrop-advocate-to-beta-testers.ts
```

Verify your test account received NFT:

```bash
npx tsx scripts/check-advocate-balance.ts
```

---

## Troubleshooting

### "Transaction will fail" error
- Make sure you're connected with the current owner wallet
- Check you have ETH on Base for gas fees

### "Not owner" error
- You're not connected with the owner wallet
- Check who the owner is using the `owner()` function

### Need to find owner wallet private key?
- Check `.env` for `POD_ADMIN_PRIVATE_KEY` or `PRIVATE_KEY`
- Check if you have access to the deployer wallet
- Look through your MetaMask accounts

---

## Quick Commands Summary

```bash
# After fixing permissions, run airdrop
npx tsx scripts/airdrop-advocate-to-beta-testers.ts

# Check if your test account got the NFT
npx tsx scripts/check-advocate-balance.ts

# Check governance page to verify it shows
# Navigate to: http://localhost:3000/governance
```
