
# On-Chain Governance V2 Architecture (Gasless with CDP)

## Date: 2026-01-22
## Status: ✅ REDESIGNED - Production Ready

---

## Overview

SpiritDAO uses a **truly gasless on-chain governance system** powered by:
- ✅ **Permanence** - All proposals and votes on blockchain
- ✅ **Transparency** - Cryptographically signed votes (EIP-712)
- ✅ **Gasless** - Coinbase CDP sponsors ALL transactions
- ✅ **Decentralized** - NO backend wallets, NO manual funding
- ✅ **Secure** - Contract verifies signatures, not trusted relayers

---

## What Changed from V1?

### V1 (INADEQUATE) ❌
```
User → DB → Backend Wallet → Contract
              ↑ (Security risk)
              ↑ (Manual funding required)
              ↑ (Single point of failure)
```

**Problems:**
- Backend service needs private key (security risk)
- Manual wallet funding (defeats CDP purpose)
- Centralized relayer (not decentralized)
- Operational overhead

### V2 (CORRECT) ✅
```
User → EIP-712 Signature → Frontend → CDP → Contract
                                       ↓ (sponsors gas)
                                   Verifies signature
```

**Benefits:**
- NO backend wallet needed
- NO manual funding (CDP handles everything)
- Truly decentralized (anyone can submit)
- Contract verifies signatures (trustless)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ USER VOTES                                                   │
│ 1. App checks pod_role_permissions (governanceParticipation)│
│ 2. User generates EIP-712 signature (in frontend)          │
│ 3. Vote stored in DB (for real-time tallies)               │
│ 4. Frontend submits signature to contract (gasless via CDP)│
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ON-CHAIN RECORDING (IMMEDIATE)                              │
│ 1. Contract receives vote + signature                       │
│ 2. Contract verifies signature with ECDSA.recover          │
│ 3. Contract checks Advocate token ownership                 │
│ 4. Contract checks voter hasn't voted yet                   │
│ 5. Emits PodVoteRecorded event (permanent on-chain)        │
│ 6. CDP sponsors the gas (contract whitelisted)             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ IPFS AGGREGATION (when proposal closes)                     │
│ 1. Aggregate all votes into VoteManifest JSON               │
│ 2. Upload to Pinata IPFS (permanent, decentralized)         │
│ 3. Post IPFS hash to PodGovernance.aggregateVotes()         │
│ 4. Emit VotesAggregated event                               │
│ 5. Call PodGovernance.finalizeProposal() with results       │
└─────────────────────────────────────────────────────────────┘
```

---

## Smart Contract: PodGovernanceV2

**Location:** `src/contracts/PodGovernanceV2.sol`
**Network:** Base
**Address:** `TBD` (update after deployment)

### Key Differences from V1:

| Feature | V1 | V2 |
|---------|----|----|
| Vote Recorder | Required backend wallet | ❌ Removed entirely |
| Access Control | `onlyVoteRecorder` modifier | ✅ Anyone can call |
| Signature Verification | Trusted backend | ✅ Contract verifies EIP-712 |
| Gas Payment | Manual wallet funding | ✅ CDP sponsors |
| Decentralization | Centralized | ✅ Fully decentralized |

### Key Functions:

1. **`recordVote(proposalId, podId, support, deadline, v, r, s)`**
   - Records a single vote on-chain
   - ANYONE can call (contract verifies signature)
   - Uses ECDSA.recover to validate signer
   - Checks Advocate token ownership
   - Emits `PodVoteRecorded` event
   - **Gasless via CDP** ✅

2. **`recordVoteBatch(...)`**
   - Records multiple votes in one transaction
   - Same verification as recordVote but batched
   - **Gasless via CDP** ✅

3. **`aggregateVotes(proposalId, ipfsHash, voteCount)`**
   - Posts aggregated votes to IPFS
   - Can be called by anyone
   - Emits `VotesAggregated` event

4. **`finalizeProposal(proposalId, result, forVotes, againstVotes, abstainVotes)`**
   - Records final result on-chain
   - Can be called by anyone
   - Emits `ProposalFinalized` event

### EIP-712 Signature:

```typescript
{
  Vote: [
    { name: 'proposalId', type: 'bytes32' },
    { name: 'podId', type: 'bytes32' },
    { name: 'support', type: 'uint8' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ]
}
```

**Domain:**
```typescript
{
  name: 'SpiritDAO Governance',
  version: '1',
  chainId: 8453, // Base
  verifyingContract: '<CONTRACT_ADDRESS>'
}
```

---

## Frontend Integration

### 1. Sign Vote (EIP-712)

```typescript
import { signVote, getVoterNonce } from '@/services/governanceSignatures';

// Get current nonce
const nonce = await getVoterNonce(publicClient, userAddress);

// Sign vote
const signature = await signVote(
  walletClient,
  proposalId,
  podId,
  'for', // or 'against', 'abstain'
  nonce
);

console.log('Signature:', signature);
// { v: 27, r: '0x...', s: '0x...', deadline: 1234567890n }
```

### 2. Submit Vote On-Chain (Gasless)

```typescript
import { submitVoteOnchain } from '@/services/governanceSignatures';

// Submit to contract (gasless via CDP)
const receipt = await submitVoteOnchain(
  publicClient,
  walletClient,
  proposalId,
  podId,
  'for',
  signature
);

console.log('Vote recorded on-chain!', receipt.transactionHash);
```

### 3. Complete Voting Flow

```typescript
import { GovernanceService } from '@/features/governance/services/governanceService';
import { signVote, getVoterNonce, submitVoteOnchain } from '@/services/governanceSignatures';

async function handleVote(proposalId: string, podId: string, vote: 'for' | 'against' | 'abstain') {
  // 1. Check permissions (app-level)
  const hasPermission = await checkGovernancePermission(userAddress, podId);
  if (!hasPermission) {
    throw new Error('No governance permission for this pod');
  }

  // 2. Get nonce
  const nonce = await getVoterNonce(publicClient, userAddress);

  // 3. Sign vote (EIP-712)
  const signature = await signVote(walletClient, proposalId, podId, vote, nonce);

  // 4. Save to DB (for real-time tallies)
  await GovernanceService.castVote({
    proposal_id: proposalId,
    voter_address: userAddress,
    vote,
    signature: signature.signature,
    pod_id: podId,
  });

  // 5. Submit to contract (gasless via CDP)
  const receipt = await submitVoteOnchain(
    publicClient,
    walletClient,
    proposalId,
    podId,
    vote,
    signature
  );

  console.log('✅ Vote recorded on-chain:', receipt.transactionHash);

  // 6. Update DB with on-chain status
  await GovernanceService.markVoteRecorded(voteId, receipt.transactionHash);
}
```

---

## Deployment Steps

### 1. Deploy Smart Contract

```bash
# Compile contract
npx hardhat compile

# Deploy to Base
npx hardhat run scripts/deploy-pod-governance-v2.cjs --network base

# Save the deployed contract address!
```

### 2. Update Environment Variables

```env
# Contract address (from deployment)
NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=0x...

# NO wallet private keys needed! ✅
```

### 3. Whitelist Contract with Coinbase CDP

**CRITICAL STEP:**

1. Go to: https://portal.cdp.coinbase.com/
2. Navigate to: Gas Station / Paymaster
3. Click "Add Contract"
4. Enter contract address: `0x...` (from deployment)
5. Enable gasless transactions
6. Set budget/limits (optional)

**Verification:**
```typescript
// Test that CDP is sponsoring gas
const receipt = await submitVoteOnchain(...);
console.log('Gas paid by:', receipt.effectiveGasPrice); // Should be 0 or sponsored
```

### 4. Apply Database Migration

```sql
-- Add fields to track on-chain recording of votes
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS onchain_recorded_at TIMESTAMPTZ;

ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id);

CREATE INDEX IF NOT EXISTS idx_governance_votes_onchain_recorded
  ON governance_votes(onchain_recorded_at)
  WHERE onchain_recorded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_governance_votes_pod_id
  ON governance_votes(pod_id);
```

### 5. Verify Contract on Basescan

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> 0x3Ad7e51578294366035ea41aAf0A15f6037a3789
```

---

## Verification & Transparency

### View Votes On-Chain

**Via Basescan Events:**
1. Go to `https://basescan.org/address/<POD_GOVERNANCE_ADDRESS>#events`
2. Filter by `PodVoteRecorded` events
3. See all votes with verification

**Verify Signature:**
```typescript
import { verifyTypedData } from 'viem';

const isValid = await verifyTypedData({
  address: voterAddress,
  domain: GOVERNANCE_DOMAIN,
  types: VOTE_TYPES,
  primaryType: 'Vote',
  message: {
    proposalId: uuidToBytes32(proposalId),
    podId: uuidToBytes32(podId),
    support: voteToUint8('for'),
    nonce: 0n,
    deadline: 1234567890n,
  },
  signature: '0x...',
});

console.log('Signature valid?', isValid);
```

---

## Benefits of V2

### 1. No Backend Wallet
- ✅ No private keys in backend
- ✅ No security risk
- ✅ No manual rotation
- ✅ No key management

### 2. Truly Gasless
- ✅ CDP handles ALL gas payments
- ✅ No manual wallet funding
- ✅ No operational overhead
- ✅ Predictable costs

### 3. Decentralized
- ✅ Anyone can submit votes
- ✅ Contract verifies signatures
- ✅ No trusted intermediaries
- ✅ No single point of failure

### 4. Transparent
- ✅ All votes on blockchain
- ✅ Signatures verifiable by anyone
- ✅ IPFS aggregation for proofs
- ✅ Permanent record

---

## Security Considerations

### 1. Signature Verification
- Contract uses ECDSA.recover (battle-tested)
- EIP-712 prevents replay attacks across chains
- Nonces prevent signature reuse
- Deadlines prevent old signatures

### 2. Advocate Token Check
- Contract verifies token ownership on-chain
- Can't be spoofed by frontend
- Checked at vote recording time
- Permanent validation

### 3. Double Voting Prevention
- `hasVoted` mapping on-chain
- Checked before recording
- Cannot vote twice on same proposal
- Permanent enforcement

### 4. No Privileged Roles
- No admin functions
- No upgradeable proxy (immutable)
- No pause mechanism
- Trustless and permissionless

---

## Gas Costs (Sponsored by CDP)

| Operation | Gas | Cost @ 1 gwei | CDP Pays |
|-----------|-----|---------------|----------|
| recordVote | ~80k | $0.0002 | ✅ Yes |
| recordVoteBatch (50) | ~2M | $0.005 | ✅ Yes |
| aggregateVotes | ~50k | $0.0001 | ✅ Yes |

**Users pay:** $0.00 ✅

---

## Comparison: V1 vs V2

| Aspect | V1 | V2 |
|--------|----|----|
| **Backend Wallet** | Required | ❌ None |
| **Manual Funding** | Required | ❌ None |
| **Security Risk** | High (private key) | ✅ Low (signatures) |
| **Decentralization** | Centralized relayer | ✅ Fully decentralized |
| **Gas Sponsorship** | Manual | ✅ Automatic (CDP) |
| **Operational Overhead** | High | ✅ None |
| **Single Point of Failure** | Yes (backend) | ✅ No |
| **Trustless** | No (trust backend) | ✅ Yes (verify on-chain) |

---

## Future Enhancements

### 1. Gasless Proposal Creation
- Users sign proposal with EIP-712
- Submit via CDP (gasless)
- Contract records on Governor

### 2. Cross-Chain Governance
- Vote on Base, execute on other chains
- Use Chainlink CCIP or LayerZero
- Unified governance across networks

### 3. Delegation
- Delegate voting power
- EIP-712 signed delegations
- On-chain delegation tracking

### 4. Vote Privacy (ZK Proofs)
- Private voting with public verification
- Vote without revealing choice
- ZK proof verifies eligibility

---

## Troubleshooting

### Votes Not Recording On-Chain

**Check:**
1. Is `NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS` set?
2. Is contract whitelisted in CDP dashboard?
3. Is voter an Advocate token holder?
4. Check signature deadline hasn't expired

### CDP Not Sponsoring Gas

**Check:**
1. Is contract address whitelisted in CDP portal?
2. Are gasless transactions enabled?
3. Is budget exceeded?
4. View CDP dashboard for transaction logs

### Signature Verification Failing

**Check:**
1. Is nonce correct? (call `getNonce()` first)
2. Is deadline in the future?
3. Is chain ID correct? (8453 for Base)
4. Is contract address in domain correct?

---

## References

- EIP-712: https://eips.ethereum.org/EIPS/eip-712
- Coinbase CDP: https://docs.cdp.coinbase.com
- ECDSA: https://docs.openzeppelin.com/contracts/cryptography
- Viem Signatures: https://viem.sh/docs/actions/wallet/signTypedData

---

## Summary

V2 Architecture Improvements:
- ✅ **NO backend wallet** (eliminated security risk)
- ✅ **NO manual funding** (CDP handles everything)
- ✅ **Fully decentralized** (anyone can submit)
- ✅ **Trustless** (contract verifies signatures)
- ✅ **Truly gasless** (CDP sponsors ALL transactions)
- ✅ **Production ready** (battle-tested cryptography)

**Next Step:** Deploy and whitelist contract with CDP!
