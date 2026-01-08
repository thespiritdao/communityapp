# Deployment Parameters for Advocate + Governor

## Step-by-Step Deployment

### 1. Deploy Advocate NFT

**Contract:** `contracts/AdvocateMembership.sol`

**Parameters:**
```
name_: "Advocate Membership"
symbol_: "ADVOCATE"
baseTokenURI_: "https://spiritdao.org/api/metadata/"
```

**After deployment:**
```solidity
// Call this immediately after deploying
setAutoDelegationEnabled(true)
```

**Save address as:** `NEW_ADVOCATE_ADDRESS`

---

### 2. Deploy Timelock (if needed)

Check if you have a Timelock deployed:

```bash
# Check .env for TIMELOCK
grep TIMELOCK .env
```

If you don't have a Timelock, deploy one:

**Contract:** OpenZeppelin `TimelockController`

**Parameters:**
```
minDelay: 172800  // 2 days in seconds (48 hours)
proposers: []     // Empty array - Governor will be granted this role after deployment
executors: []     // Empty array - Governor will be granted this role after deployment
admin: YOUR_WALLET_ADDRESS  // Your deployment wallet
```

**Save address as:** `TIMELOCK_ADDRESS`

---

### 3. Deploy Governor

**Contract:** `src/contracts/DAOGovernor.sol`

**Parameters:**
```
_token: NEW_ADVOCATE_ADDRESS (from step 1)
_timelock: TIMELOCK_ADDRESS (from step 2 or existing)
_name: "SpiritDAO Governor"
_votingDelay: 1 (blocks - ~2 seconds on Base)
_votingPeriod: 7200 (blocks - ~4 hours on Base at 2sec/block)
_proposalThreshold: 1 (minimum 1 Advocate NFT to create proposal)
_quorumPercentage: 4 (4% quorum)
```

**After deployment - Grant Timelock Roles:**

```solidity
// On the Timelock contract, grant roles to the new Governor

// Grant PROPOSER_ROLE
grantRole(PROPOSER_ROLE, NEW_GOVERNOR_ADDRESS)

// Grant EXECUTOR_ROLE
grantRole(EXECUTOR_ROLE, NEW_GOVERNOR_ADDRESS)

// PROPOSER_ROLE = keccak256("PROPOSER_ROLE")
// = 0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1

// EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE")
// = 0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63
```

**Save address as:** `NEW_GOVERNOR_ADDRESS`

---

## Quick Reference

### Deployment Order:
1. ✅ Advocate NFT → Get address
2. ✅ Timelock (if needed) → Get address
3. ✅ Governor (with Advocate + Timelock) → Get address
4. ✅ Grant Timelock roles to Governor
5. ✅ Enable auto-delegation on Advocate

### Addresses to Save:
- `NEW_ADVOCATE_ADDRESS`
- `TIMELOCK_ADDRESS` (if deployed new)
- `NEW_GOVERNOR_ADDRESS`

### Configuration Updates:
- `.env` - Update ADVOCATE and GOVERNOR addresses
- Database - Update `tokens` table
- Paymaster - Add to whitelist (if needed)

---

## Remix Deployment Checklist

### Before Deploying:

- [ ] Connected to Base Mainnet in MetaMask
- [ ] Have enough ETH for gas (~0.01 ETH should be plenty)
- [ ] Compiled all contracts with 0.8.20
- [ ] Ready to copy addresses immediately after deployment

### Advocate NFT:

- [ ] Deploy with correct parameters
- [ ] Copy address
- [ ] Call `setAutoDelegationEnabled(true)`
- [ ] Verify on BaseScan

### Timelock (if needed):

- [ ] Deploy with correct parameters
- [ ] Copy address
- [ ] Verify on BaseScan

### Governor:

- [ ] Deploy with NEW_ADVOCATE_ADDRESS
- [ ] Copy address
- [ ] Grant PROPOSER_ROLE on Timelock
- [ ] Grant EXECUTOR_ROLE on Timelock
- [ ] Verify on BaseScan

### Post-Deployment:

- [ ] Update `.env`
- [ ] Update database
- [ ] Restart dev server
- [ ] Run airdrop script
- [ ] Test in app

---

## Commands to Run After Deployment

```bash
# Update .env file with new addresses
# (Do this manually or use sed/editor)

# Update database
# Run SQL in Supabase SQL Editor:
UPDATE tokens SET contract_address = 'NEW_ADVOCATE_ADDRESS' WHERE id = 'advocate';

# Restart dev server
npm run dev

# Run airdrop
npx tsx scripts/airdrop-advocate-to-beta-testers.ts

# Verify Advocate balances
npx tsx scripts/check-advocate-balance.ts

# Verify Governor config
npx tsx scripts/check-governor-config.ts
```

---

## Troubleshooting

### "Timelock delay not met"
- Proposals need to wait the timelock delay (2 days) before execution
- This is expected behavior

### "Insufficient voting power"
- Make sure NFTs are delegated
- Check `getVotes(address)` on Advocate contract

### "Governor not updated"
- Clear browser cache
- Restart dev server
- Check .env has correct addresses

---

## Time Estimate

- Deploy Advocate: 3 min
- Verify Advocate: 3 min
- Deploy Timelock (if needed): 3 min
- Deploy Governor: 3 min
- Configure Timelock roles: 5 min
- Verify Governor: 3 min
- Update config + restart: 5 min
- Run airdrop: 3 min
- Test: 5 min

**Total: ~33 minutes**

Ready to deploy!
