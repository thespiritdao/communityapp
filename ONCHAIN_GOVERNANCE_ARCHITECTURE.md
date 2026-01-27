

# On-Chain Governance Architecture (Option 3: Hybrid)

## Date: 2026-01-22
## Status: 🚧 IN DEVELOPMENT

---

## Overview

SpiritDAO uses a **hybrid on-chain governance system** that combines:
- ✅ **Permanence** - All proposals stored on blockchain (immutable)
- ✅ **Transparency** - All votes cryptographically signed and verifiable
- ✅ **Flexibility** - Pod-specific permissions (app-controlled)
- ✅ **Gasless** - Users never pay gas (CDP sponsorship)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ USER VOTES                                                   │
│ 1. App checks pod_role_permissions (governanceParticipation)│
│ 2. User generates cryptographic signature (wallet)          │
│ 3. Vote stored in DB (immediate, for real-time tallies)     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ BATCHED ON-CHAIN RECORDING                                  │
│ Service runs every 5 minutes or 50 votes:                   │
│ 1. Fetch unrecorded votes from governance_votes             │
│ 2. Call PodGovernance.recordVoteBatch() (gasless via CDP)   │
│ 3. Emits PodVoteRecorded events (permanent blockchain logs) │
│ 4. Mark votes as onchain_recorded_at in DB                  │
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

## Smart Contract: PodGovernance

**Location:** `contracts/PodGovernance.sol`
**Network:** Base
**Address:** `TBD` (update after deployment)

### Key Functions:

1. **`recordVote(proposalId, podId, voter, support, signature)`**
   - Records a single vote on-chain
   - Emits `PodVoteRecorded` event
   - Called by authorized vote recorder service

2. **`recordVoteBatch(...)`**
   - Records multiple votes in one transaction (gas efficient)
   - Same as recordVote but batched

3. **`aggregateVotes(proposalId, ipfsHash, voteCount)`**
   - Posts aggregated votes to IPFS
   - Emits `VotesAggregated` event
   - Called when proposal closes

4. **`finalizeProposal(proposalId, result, forVotes, againstVotes, abstainVotes)`**
   - Records final result on-chain
   - Emits `ProposalFinalized` event

### Events:

```solidity
event PodVoteRecorded(
    bytes32 indexed proposalId,
    bytes32 indexed podId,
    address indexed voter,
    uint8 support,
    bytes signature,
    uint256 timestamp
);

event VotesAggregated(
    bytes32 indexed proposalId,
    string ipfsHash,
    uint256 voteCount,
    uint256 timestamp
);

event ProposalFinalized(
    bytes32 indexed proposalId,
    string result,
    uint256 forVotes,
    uint256 againstVotes,
    uint256 abstainVotes
);
```

---

## Services

### 1. Vote Recording Service

**Location:** `src/services/voteRecordingService.ts`

**Purpose:** Batch votes and post to PodGovernance contract

**Configuration:**
- `BATCH_SIZE`: 50 votes per batch
- `BATCH_INTERVAL_MS`: 5 minutes

**Flow:**
1. Runs every 5 minutes
2. Queries `governance_votes` where `onchain_recorded_at IS NULL`
3. Groups votes by proposal
4. Calls `recordVoteBatch()` via CDP (gasless)
5. Updates `onchain_recorded_at` in DB

**Start Service:**
```typescript
import { VoteRecordingService } from '@/services/voteRecordingService';

// In your backend/cron job
VoteRecordingService.startBatchService();
```

### 2. IPFS Aggregation Service

**Location:** `src/services/ipfsAggregationService.ts`

**Purpose:** Aggregate votes and upload to IPFS when proposal closes

**Configuration:**
- `PINATA_JWT`: Your Pinata API key
- `CHECK_INTERVAL`: 10 minutes

**Flow:**
1. Runs every 10 minutes
2. Queries `pod_level_proposals` where `status = 'proposed'` and `voting_deadline < NOW()`
3. Aggregates all votes into VoteManifest
4. Uploads to Pinata IPFS
5. Posts IPFS hash to PodGovernance contract
6. Updates proposal status to 'approved' or 'rejected'

**Vote Manifest Structure:**
```typescript
{
  proposalId: string,
  podId: string,
  podName: string,
  title: string,
  description: string,
  createdAt: string,
  closedAt: string,
  votes: [
    {
      voter: "0x...",
      vote: "for" | "against" | "abstain",
      signature: "0x...",
      timestamp: "2026-01-22T...",
      hat_id: "0x..."
    }
  ],
  tally: {
    for: 10,
    against: 5,
    abstain: 2,
    total: 17
  },
  result: "approved" | "rejected",
  metadata: {
    forumThreadId: "...",
    onchainProposalId: "...",
    transactionHash: "0x..."
  }
}
```

**Start Service:**
```typescript
import { IPFSAggregationService } from '@/services/ipfsAggregationService';

// In your backend/cron job
IPFSAggregationService.startAggregationService();
```

---

## Database Schema

### `governance_votes` Table Updates

```sql
ALTER TABLE governance_votes ADD COLUMN onchain_recorded_at TIMESTAMPTZ;
ALTER TABLE governance_votes ADD COLUMN pod_id UUID REFERENCES pods(id);

CREATE INDEX idx_governance_votes_onchain_recorded
  ON governance_votes(onchain_recorded_at)
  WHERE onchain_recorded_at IS NULL;
```

**Fields:**
- `onchain_recorded_at`: When vote was posted to PodGovernance contract
- `pod_id`: Which pod this vote belongs to

---

## Deployment Steps

### 1. Deploy Smart Contract

```bash
# Install dependencies
npm install --save-dev hardhat @openzeppelin/contracts

# Compile contract
npx hardhat compile

# Deploy to Base
npx hardhat run scripts/deploy-pod-governance.cjs --network base

# Verify on Basescan
npx hardhat verify --network base <CONTRACT_ADDRESS> <ADVOCATE_TOKEN> <VOTE_RECORDER>
```

**Note:** Contract has been updated to use `supportValues` parameter instead of `supports` to avoid Solidity 0.8.20 reserved keyword collision.

### 2. Update Environment Variables

```env
# Contract address (from deployment)
NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=0x...

# Pinata configuration (already set)
PINATA_JWT=eyJhbGci...
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud

# Vote recorder service wallet (create new wallet for this)
VOTE_RECORDER_PRIVATE_KEY=0x...
```

### 3. Apply Database Migration

```bash
# Run migration
psql $DATABASE_URL -f supabase/migrations/20260122000002_add_onchain_recording_fields.sql

# Or via Supabase Dashboard > SQL Editor
```

### 4. Start Background Services

**Option A: Vercel Cron Jobs**
```typescript
// app/api/cron/record-votes/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Record votes
  const votes = await VoteRecordingService.getUnrecordedVotes();
  const results = await VoteRecordingService.recordVoteBatch(votes);

  return Response.json({ success: true, results });
}
```

**Option B: Dedicated Service**
```typescript
// services/background-worker.ts
import { VoteRecordingService } from './voteRecordingService';
import { IPFSAggregationService } from './ipfsAggregationService';

// Start both services
VoteRecordingService.startBatchService();
IPFSAggregationService.startAggregationService();

console.log('✅ Background services started');
```

### 5. Update Vote Recording Address

```bash
# Call setVoteRecorder on the contract
npx hardhat run scripts/set-vote-recorder.ts --network base
```

---

## Verification & Transparency

### View Votes On-Chain

**Via Basescan Events:**
1. Go to `https://basescan.org/address/<POD_GOVERNANCE_ADDRESS>#events`
2. Filter by `PodVoteRecorded` events
3. See all votes with signatures

**Via IPFS:**
1. Get IPFS hash from `VotesAggregated` event
2. View at: `https://gateway.pinata.cloud/ipfs/<HASH>`
3. Full vote manifest with all votes and signatures

### Verify Vote Signature

```typescript
import { verifyMessage } from 'viem';

const message = JSON.stringify({
  proposal_id: "...",
  voter: "0x...",
  vote: "for",
  timestamp: "...",
  hat_id: "0x..."
});

const isValid = await verifyMessage({
  address: "0x...", // voter address
  message,
  signature: "0x..." // from vote record
});
```

---

## Benefits

### 1. Permanence
- All proposals on blockchain (Governor contract)
- All votes in blockchain events (PodGovernance contract)
- IPFS storage for aggregated proof

### 2. Transparency
- Anyone can read votes from Basescan
- Anyone can verify signatures
- Anyone can access IPFS manifests

### 3. Flexibility
- Pod-specific permissions (app controls who can vote)
- Easy to update rules without contract changes
- Support for infinite pod nesting

### 4. User Experience
- Gasless voting (CDP sponsorship)
- Real-time vote tallies (DB)
- No blockchain knowledge required

---

## Security Considerations

### 1. Vote Recorder Wallet
- **Critical:** Keep `VOTE_RECORDER_PRIVATE_KEY` secure
- Use separate wallet just for recording
- Monitor for unauthorized transactions
- Rotate keys periodically

### 2. Signature Verification
- Contract verifies Advocate token ownership
- Signatures prove vote authenticity
- Cannot vote twice (hasVoted mapping)

### 3. IPFS Immutability
- Once uploaded, cannot be changed
- Verify IPFS hash matches on-chain event
- Pinata ensures availability

---

## Future Enhancements

### 1. Real-Time On-Chain Recording
- Instead of batching, record each vote immediately
- Requires more gas (but gasless for users via CDP)
- Trade-off: immediacy vs. efficiency

### 2. Zero-Knowledge Proofs
- Private voting with public verification
- Users can vote without revealing choice
- ZK proof verifies eligibility without exposing identity

### 3. On-Chain Execution
- Approved proposals automatically execute
- Integrate with Safe multisig
- Treasury operations triggered by votes

### 4. Cross-Chain Governance
- Vote on Base, execute on other chains
- Use Chainlink CCIP or LayerZero
- Unified governance across multiple networks

---

## Troubleshooting

### Votes Not Appearing On-Chain

**Check:**
1. Is `NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS` set?
2. Is vote recorder service running?
3. Check `onchain_recorded_at` in `governance_votes` table
4. View logs from `VoteRecordingService`

### IPFS Upload Failing

**Check:**
1. Is `PINATA_JWT` valid?
2. Check Pinata dashboard for quota
3. Verify vote manifest structure
4. Check network connectivity

### Contract Call Failing

**Check:**
1. Does vote recorder wallet have gas?
2. Is voter an Advocate token holder?
3. Has voter already voted? (hasVoted mapping)
4. Check contract logs on Basescan

---

## References

- Snapshot: https://snapshot.org (inspiration for hybrid model)
- OpenZeppelin Governor: https://docs.openzeppelin.com/contracts/governance
- Pinata IPFS: https://docs.pinata.cloud
- Coinbase CDP: https://docs.cdp.coinbase.com

---

## Summary

This hybrid system gives you:
- ✅ **All proposals on-chain** (as requested)
- ✅ **All votes cryptographically signed**
- ✅ **Periodic on-chain recording** (batched for efficiency)
- ✅ **IPFS aggregation** (permanent proof)
- ✅ **Pod-specific permissions** (flexible governance)
- ✅ **Gasless for users** (CDP sponsorship)

**Next Step:** Deploy the PodGovernance contract and start the background services!
