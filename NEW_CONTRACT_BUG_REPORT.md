# PodGovernanceV3 (NEW Contract) Bug Report

## Summary

The NEW PodGovernanceV3 contract deployed on 2026-01-22 **does not work**. All validation checks pass, but the `recordVote()` function reverts with no error message.

## Contract Details

**NEW Contract (BROKEN):**
- Address: `0x218770E85b8938879677388D05D78BF76587ED7A`
- Deployed: 2026-01-22 (per .env comment)
- Bytecode: 7890 characters
- Status: ❌ **REVERTS - DO NOT USE**

**OLD Contract (WORKING):**
- Address: `0xD19143da8c319484d4c093A709DC93624345b690`
- Deployed: Unknown (original version)
- Bytecode: 3488 characters
- Status: ✅ **WORKS PERFECTLY**

## Issue Description

When calling `recordVote()` on the NEW contract, it reverts with:
```
The contract function "recordVote" reverted.
```

No revert reason is provided (raw data: `0x`).

## Diagnostic Results

All pre-conditions are MET:

1. ✅ **Advocate Token Check**
   - Contract configured with: `0x3Ad7e51578294366035ea41aAf0A15f6037a3789`
   - User balance: `1` (owns Advocate NFT)
   - Expected: `> 0` ✅ PASS

2. ✅ **Has Voted Check**
   - On-chain value: `false`
   - Expected: `false` (not voted yet) ✅ PASS

3. ✅ **Support Value Check**
   - Value: `1` (FOR)
   - Expected: `<= 2` ✅ PASS

4. ✅ **Contract Deployment**
   - Bytecode exists: YES
   - Size: 7890 chars (126% larger than OLD)

**ALL CHECKS PASS, YET IT STILL REVERTS!**

## Test Commands

### Simulation Test (NEW Contract - FAILS)
```javascript
const result = await client.simulateContract({
  address: '0x218770E85b8938879677388D05D78BF76587ED7A',
  abi: parseAbi(['function recordVote(bytes32, bytes32, uint8) external']),
  functionName: 'recordVote',
  args: [proposalId, podId, 1],
  account: '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48',
});
// Result: ❌ REVERTS
```

### Simulation Test (OLD Contract - WORKS)
```javascript
const result = await client.simulateContract({
  address: '0xD19143da8c319484d4c093A709DC93624345b690',
  abi: parseAbi(['function recordVote(bytes32, bytes32, uint8) external']),
  functionName: 'recordVote',
  args: [proposalId, podId, 1],
  account: '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48',
});
// Result: ✅ SUCCESS
```

## Possible Causes

1. **Wrong Source Code Deployed**
   - The deployed bytecode may not match `PodGovernanceV3.sol`
   - Check BaseScan verified source code

2. **Additional Hidden Requirements**
   - Contract may have checks not visible in the source we have
   - Could be using modifiers or internal functions

3. **Proxy/Delegate Pattern Issue**
   - Contract might be using delegatecall
   - Storage slots could be corrupted

4. **Smart Account Incompatibility**
   - Contract might have `tx.origin` checks
   - Or other AA-incompatible patterns

5. **Compiler Bug or Optimization Issue**
   - Contract may have been compiled with wrong settings
   - Solidity optimizer might have introduced bug

## Immediate Action Taken

**Reverted to OLD contract:**
- Updated `.env` to use `0xD19143da8c319484d4c093A709DC93624345b690`
- This contract works and is already whitelisted in CDP Paymaster
- Voting now functional

## Recommended Investigation

### Step 1: Check BaseScan
https://basescan.org/address/0x218770E85b8938879677388D05D78BF76587ED7A#code

Verify:
- Is the source code verified?
- Does it match `PodGovernanceV3.sol`?
- What compiler version and settings were used?

### Step 2: Check Deployment Script
Find the script that deployed the NEW contract and verify:
- Was it deployed correctly?
- Were constructor args correct?
- Was there an error during deployment?

### Step 3: Compare Contracts
Use a contract diff tool to compare:
- OLD contract source (if available)
- NEW contract source
- Identify what changed

### Step 4: Test with Tenderly
Use Tenderly debugger to:
- Simulate the failing transaction
- Get detailed execution trace
- See exact line where it reverts

## Files to Check

1. `src/contracts/PodGovernanceV3.sol` - Source code
2. `scripts/deploy-*.mjs` - Deployment scripts
3. Deployment logs from 2026-01-22
4. Git history around that date

## Priority

🟡 **MEDIUM** - Not blocking (using OLD contract as workaround)

But should investigate to understand:
- Why was NEW contract deployed?
- What features does it add?
- Can we fix it and redeploy?

## Status

- [x] Issue identified
- [x] Workaround implemented (use OLD contract)
- [ ] Root cause determined
- [ ] Fix deployed
- [ ] NEW contract working

---

**Date:** 2026-02-19
**Reporter:** Claude Code
**Impact:** Governance voting was broken until reverting to OLD contract
