# PodGovernance Contract Compilation Fix

## Date: 2026-01-22
## Status: ✅ FIXED AND COMPILED

---

## Issue

When attempting to deploy `PodGovernance.sol`, encountered parser error:

```
ParserError: Expected ',' but got reserved keyword 'supports'
   --> SpiritDAO/PodGovernance.sol:137:26:
    |
137 |         uint8[] calldata supports,
    |                          ^^^^^^^^
```

## Root Cause

In Solidity 0.8.20+, `supports` is a **reserved keyword** used for interface support checks. Using it as a parameter name causes a parser error.

## Solution

Renamed all instances of `supports` parameter to `supportValues` throughout the codebase:

### 1. Smart Contract (`src/contracts/PodGovernance.sol`)

**Before:**
```solidity
function recordVoteBatch(
    bytes32 proposalId,
    bytes32[] calldata podIds,
    address[] calldata voters,
    uint8[] calldata supports,  // ❌ Reserved keyword
    bytes[] calldata signatures
) external onlyVoteRecorder {
    // ...
    require(supports[i] <= ABSTAIN, "...");
    // ...
}
```

**After:**
```solidity
function recordVoteBatch(
    bytes32 proposalId,
    bytes32[] calldata podIds,
    address[] calldata voters,
    uint8[] calldata supportValues,  // ✅ Not reserved
    bytes[] calldata signatures
) external onlyVoteRecorder {
    // ...
    require(supportValues[i] <= ABSTAIN, "...");
    // ...
}
```

### 2. Vote Recording Service (`src/services/voteRecordingService.ts`)

**Updated ABI:**
```typescript
const POD_GOVERNANCE_ABI = [
  {
    name: 'recordVoteBatch',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'podIds', type: 'bytes32[]' },
      { name: 'voters', type: 'address[]' },
      { name: 'supportValues', type: 'uint8[]' },  // ✅ Updated
      { name: 'signatures', type: 'bytes[]' },
    ],
  },
]
```

**Updated variable name:**
```typescript
const supportValues = proposalVotes.map(v => this.voteToUint8(v.vote));  // ✅ Updated
```

### 3. Deployment Script (`scripts/deploy-pod-governance.cjs`)

- Renamed from `.ts` to `.cjs` (CommonJS) to avoid ESM/Chai compatibility issues
- Updated import statement from `import` to `require`

### 4. Hardhat Configuration (`hardhat.config.cjs`)

Added Base network configuration:
```javascript
networks: {
  base: {
    url: 'https://mainnet.base.org',
    chainId: 8453,
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
  },
  'base-sepolia': {
    url: 'https://sepolia.base.org',
    chainId: 84532,
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
  },
}
```

---

## Compilation Result

```bash
npx hardhat compile
```

**Output:**
```
✅ Compiled 102 Solidity files successfully (evm target: cancun).
```

Contract location: `src/contracts/PodGovernance.sol`

---

## Files Modified

1. ✅ `src/contracts/PodGovernance.sol` - Renamed `supports` → `supportValues`
2. ✅ `src/services/voteRecordingService.ts` - Updated ABI and variable name
3. ✅ `scripts/deploy-pod-governance.cjs` - Converted to CommonJS
4. ✅ `hardhat.config.cjs` - Added Base network config
5. ✅ `ONCHAIN_GOVERNANCE_ARCHITECTURE.md` - Updated deployment commands
6. ✅ `DEPLOYMENT_CHECKLIST.md` - Marked compilation as complete

---

## Next Steps

### 1. Apply Database Migration (Manual Required)

The migration needs to be applied via Supabase Dashboard:

**Go to:** https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/sql

**Run this SQL:**
```sql
-- Add fields to track on-chain recording of votes
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS onchain_recorded_at TIMESTAMPTZ;

-- Add index for efficiently querying unrecorded votes
CREATE INDEX IF NOT EXISTS idx_governance_votes_onchain_recorded
  ON governance_votes(onchain_recorded_at)
  WHERE onchain_recorded_at IS NULL;

-- Add field to track which pod a vote belongs to (for pod-level proposals)
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id);

-- Add index for pod-based queries
CREATE INDEX IF NOT EXISTS idx_governance_votes_pod_id
  ON governance_votes(pod_id);

-- Comments
COMMENT ON COLUMN governance_votes.onchain_recorded_at IS 'Timestamp when this vote was posted to the PodGovernance contract';
COMMENT ON COLUMN governance_votes.pod_id IS 'The pod this vote belongs to (for pod-level proposals)';
```

### 2. Deploy PodGovernance Contract

**Prerequisites:**
- Deployer wallet with ETH on Base network
- Add `DEPLOYER_PRIVATE_KEY` to `.env`

**Deploy to Base Mainnet:**
```bash
npx hardhat run scripts/deploy-pod-governance.cjs --network base
```

**Deploy to Base Sepolia (Testnet):**
```bash
npx hardhat run scripts/deploy-pod-governance.cjs --network base-sepolia
```

### 3. Update Environment Variables

After deployment, add to `.env`:
```env
NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=<deployed_contract_address>
DEPLOYER_PRIVATE_KEY=<your_deployer_wallet_private_key>
VOTE_RECORDER_PRIVATE_KEY=<create_new_wallet_for_recording>
```

### 4. Verify Contract on Basescan

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> 0x3Ad7e51578294366035ea41aAf0A15f6037a3789 <VOTE_RECORDER_ADDRESS>
```

---

## References

- **Full Architecture:** `ONCHAIN_GOVERNANCE_ARCHITECTURE.md`
- **Deployment Checklist:** `DEPLOYMENT_CHECKLIST.md`
- **Contract:** `src/contracts/PodGovernance.sol`
- **Vote Recording Service:** `src/services/voteRecordingService.ts`
- **IPFS Aggregation Service:** `src/services/ipfsAggregationService.ts`

---

## Why `supportValues` Instead of `supports`?

1. **Not Reserved:** `supportValues` is not a Solidity keyword
2. **Clear Intent:** Explicitly indicates these are vote support values
3. **Future-Proof:** Avoids potential collisions with future Solidity versions
4. **Best Practice:** Use descriptive names in governance contracts

Other valid alternatives:
- `voteChoices`
- `voteTypes`
- `voteSupport`

---

**Status:** Ready for deployment once database migration is applied! 🚀
