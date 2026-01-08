# CDP Contract Whitelist for Gas Sponsorship

## Critical: Required Contracts for Gas-Sponsored Transactions

All contracts below must be whitelisted in your CDP Dashboard at:
**https://portal.cdp.coinbase.com/projects/ac6341ec-857b-4a8e-936a-ae1a84cb877f/settings**

Network: **Base Mainnet** (Chain ID: 8453)

---

## ✅ Already Whitelisted (Confirmed Working)

### 1. TokenFaucet
- **Address**: `0x189aA1FA8CC41A26944A0957015d9902057c1dbA`
- **Status**: ✅ Working (gasless token claims)
- **Functions**: `claimTokens()`

### 2. EventManager
- **Address**: `0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9`
- **Status**: ✅ Working (gasless event creation)
- **Functions**:
  - `createEvent(string,string,uint256,address,uint256,uint256,uint256)`
  - `registerForEvent(string)`
  - `checkIn(string,address)`
  - `cancelEvent(string)`
  - `completeEvent(string)`

### 3. EventEscrow
- **Address**: `0x9D868cc947e8051369E0e469E14Ef2aEe10f55Be`
- **Status**: ✅ Whitelisted
- **Functions**:
  - `depositForEvent(string,uint256,uint256)`
  - `refundDeposit(string,address)`
  - `releaseEventFunds(string)`

---

## ⚠️ Need Whitelisting - Critical Priority

### 4. BountyManager (Priority 1 - CRITICAL)
- **Address**: `0xc2Ac53e7C869Ed9Bcd21b72C7aE747Abb788A8e5`
- **Impact**: Cannot create, assign, or pay bounties
- **Required Functions**:
  ```solidity
  createBounty(string,string,uint256,address,uint256,uint256)
  submitBid(uint256,address,string)
  assignBounty(uint256,uint256,address,address)
  submitWork(uint256,uint256,string)
  approveWork(uint256,uint256)
  releaseFunds(uint256,uint256)
  cancelBounty(uint256)
  releaseMilestone(uint256,uint256)
  ```
- **Files Affected**: 11 bounty transaction components

### 5. HatsProtocol (Priority 1 - CRITICAL)
- **Address**: `0x3bc1a0ad72417f2d411118085256fc53cbddd137` (Base Mainnet - DO NOT CHANGE)
- **Impact**: Cannot approve pod applications, remove members, create roles
- **Required Functions**:
  ```solidity
  mintHat(uint256,address)
  setHatStatus(uint256,bool)
  createHat(uint256,string,uint32,address,address,bool,string)
  transferHat(uint256,address,address)
  renounceHat(uint256)
  makeHatImmutable(uint256)
  changeHatDetails(uint256,string)
  changeHatEligibility(uint256,address)
  changeHatToggle(uint256,address)
  changeHatImageURI(uint256,string)
  setHatWearerStatus(uint256,address,bool,bool)
  ```
- **Files Affected**: 15+ pods member management components

### 6. TreasuryProxy (Priority 1 - CRITICAL)
- **Address**: `0x6B68FeAD052d02d8f3E602Dd343fA3c624d63b9C`
- **Impact**: Cannot distribute treasury funds
- **Required Functions**:
  ```solidity
  distribute(address[],uint256[],address)
  distributeEqual(address[],address)
  transfer(address,uint256,address)
  transferFromTreasury(address,address,uint256)
  batchTransfer(address[],uint256[],address)
  ```
- **Files Affected**: 6 treasury management components

### 7. TreasuryFactory (Priority 2 - HIGH)
- **Address**: `0xb9e3D01C144c5Bfcd5816afea9190371B0843be6`
- **Impact**: Cannot deploy new pod treasuries
- **Required Functions**:
  ```solidity
  deployTreasury(address,uint256)
  registerTreasury(address,address)
  setTreasuryImplementation(address)
  ```
- **Files Affected**: ConsolidatedTreasuryDeployer, TreasuryRegistrationTool

### 8. PodCreationManager (Priority 2 - HIGH)
- **Address**: `0x43C124Df0dFb324CCC742808D9FdF62C764f2644`
- **Impact**: Cannot create new pods
- **Required Functions**:
  ```solidity
  createPod(string,string,address[],uint256)
  approvePod(string)
  rejectPod(string)
  ```
- **Files Affected**: Pod creation workflows

### 9. HatsModuleFactory (Priority 2 - HIGH)
- **Address**: `0xfE661c01891172046feE16D3a57c3Cf456729efA`
- **Impact**: Cannot deploy hat modules (eligibility, toggle)
- **Required Functions**:
  ```solidity
  createHatsModule(address,uint256,bytes,bytes,uint256)
  ```
- **Files Affected**: HatsModulePodCreationForm, module deployment services

---

## Optional Contracts (Medium/Low Priority)

### 10. PodBountyService
- **Address**: `0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396`
- **Priority**: Medium
- **Impact**: Pod-specific bounty features

### 11. PodAuthFactory
- **Address**: `0xaddD8f909B0710BBC3c068B470495fA7EFCBc047`
- **Priority**: Medium
- **Impact**: Pod authentication modules

### 12. EligibilityModule
- **Address**: `0x437e353Ad09cA2fc870bAf19D08AEb08cA81B925`
- **Priority**: Low
- **Impact**: Custom eligibility criteria

### 13. TimeBasedToggleModule
- **Address**: `0xDABE0119fBC7eA5821283dB666C8701049351D95`
- **Priority**: Low
- **Impact**: Time-bound memberships

### 14. HatMinter
- **Address**: `0x781354300f0fD7CaE55fa803958d0cbf466aEe7b`
- **Priority**: Low
- **Impact**: Automated hat minting (has Exec Pod hat)

---

## Whitelisting Instructions

### Step 1: Access CDP Dashboard
1. Go to: https://portal.cdp.coinbase.com
2. Navigate to your project: **SpiritDAO** (`ac6341ec-857b-4a8e-936a-ae1a84cb877f`)
3. Click **Settings** → **Gas Sponsorship**

### Step 2: Configure Base Mainnet Paymaster
- Ensure paymaster is enabled for **Base Mainnet** (Chain ID: 8453)
- Paymaster URL: `https://api.developer.coinbase.com/rpc/v1/base/[REDACTED]`

### Step 3: Add Contract Addresses
For each contract above:
1. Click **Add Contract**
2. Enter contract address (e.g., `0xc2Ac53e7C869Ed9Bcd21b72C7aE747Abb788A8e5`)
3. Select **Base Mainnet** network
4. Add specific function signatures (or use wildcard `*` for all functions)
5. Click **Save**

### Step 4: Verify Whitelisting
After adding contracts, verify by:
1. Checking CDP Dashboard shows all contracts listed
2. Testing a transaction from the app (should be gasless)
3. Checking transaction logs show `useCdpPaymaster: true`

---

## Function Signature Format

When whitelisting specific functions, use the format:
```
functionName(type1,type2,type3)
```

**Examples**:
- ✅ Correct: `createBounty(string,string,uint256,address,uint256,uint256)`
- ❌ Wrong: `createBounty(title, description, deadline, creator, amount, token)`
- ❌ Wrong: `createBounty(string title, string description, ...)`

**Pro Tip**: Use `*` wildcard to whitelist all functions on a contract (recommended for initial setup).

---

## Priority Whitelisting Schedule

### Week 1 (CRITICAL - Required for basic operations)
1. ✅ TokenFaucet (already done)
2. ✅ EventManager (already done)
3. ✅ EventEscrow (already done)
4. ⚠️ BountyManager
5. ⚠️ HatsProtocol
6. ⚠️ TreasuryProxy

### Week 2 (HIGH - Required for advanced features)
7. TreasuryFactory
8. PodCreationManager
9. HatsModuleFactory

### Week 3 (MEDIUM/LOW - Optional features)
10-14. Remaining contracts as needed

---

## Verification Checklist

After whitelisting each contract, verify:

### BountyManager
- [ ] Can create bounty without gas fees
- [ ] Can submit bid without gas fees
- [ ] Can assign bounty without gas fees
- [ ] Can pay bounty worker without gas fees

### HatsProtocol
- [ ] Can approve pod application (mint hat) without gas fees
- [ ] Can remove member (revoke hat) without gas fees
- [ ] Can create new role (create hat) without gas fees

### TreasuryProxy
- [ ] Can distribute funds to members without gas fees
- [ ] Can transfer tokens from treasury without gas fees

### TreasuryFactory
- [ ] Can deploy new treasury without gas fees

---

## Troubleshooting

### Error: "Insufficient balance to execute the transaction"
**Cause**: Contract not whitelisted or function signature mismatch
**Fix**:
1. Verify contract address is whitelisted in CDP Dashboard
2. Check function signature matches exactly (use `*` for all functions)
3. Ensure network is Base Mainnet (8453), not testnet

### Error: "500 Internal Server Error" from CDP API
**Cause**: Contract whitelisting issue or CDP infrastructure
**Fix**:
1. Double-check contract is whitelisted
2. Wait 5-10 minutes for whitelisting to propagate
3. Try transaction again
4. Check CDP status page for outages

### Error: "Contract not allowed for gas sponsorship"
**Cause**: Explicit error - contract not in whitelist
**Fix**: Add contract to CDP Dashboard whitelist immediately

---

## Security Considerations

### Whitelisting Best Practices
1. **Use Specific Functions**: Whitelist only functions your app uses (more secure)
2. **Audit Regularly**: Review whitelisted contracts monthly
3. **Monitor Usage**: Check CDP Dashboard for unusual gas spending
4. **Limit Scope**: Don't whitelist admin-only functions if not needed

### Gas Budget Management
- Set spending limits in CDP Dashboard
- Monitor gas usage per contract
- Get alerts for unusual spending patterns
- Review transaction logs regularly

---

## Contract Sources

All contract addresses are defined in:
- **Config File**: `src/config/contracts.ts`
- **Environment**: `.env` file (Base Mainnet addresses)
- **Verification**: Contract Explorer on BaseScan

To update addresses:
1. Edit `.env` file
2. Redeploy app
3. Update CDP Dashboard whitelist
4. Test transactions

---

## Support

If you encounter issues:
1. Check CDP Dashboard for error logs
2. Review `TRANSACTION_PATTERN_AUDIT.md` for refactoring status
3. Verify pattern matches `FAUCET_PATTERN_VERIFICATION.md`
4. Check BaseScan for contract verification status

---

**Last Updated**: 2025-12-18
**CDP Project**: SpiritDAO (`ac6341ec-857b-4a8e-936a-ae1a84cb877f`)
**Network**: Base Mainnet (Chain ID: 8453)
**Status**: 3/15 contracts whitelisted (TokenFaucet, EventManager, EventEscrow)
