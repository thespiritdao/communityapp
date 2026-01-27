# On-Chain Governance Deployment Checklist

## Status: 🚧 Ready for Deployment

All infrastructure code has been created. Follow this checklist to deploy the hybrid on-chain governance system.

---

## ✅ Completed

- [x] Created PodGovernance.sol smart contract
- [x] Fixed Solidity reserved keyword collision (`supports` → `supportValues`)
- [x] Successfully compiled contract with Hardhat (102 files compiled)
- [x] Created deployment script (scripts/deploy-pod-governance.cjs)
- [x] Created vote recording service (src/services/voteRecordingService.ts)
- [x] Created IPFS aggregation service (src/services/ipfsAggregationService.ts)
- [x] Created database migration (supabase/migrations/20260122000002_add_onchain_recording_fields.sql)
- [x] Created comprehensive documentation (ONCHAIN_GOVERNANCE_ARCHITECTURE.md)
- [x] Created migration helper script (scripts/apply-onchain-migration.mjs)

---

## 📋 Deployment Steps

### Step 1: Apply Database Migration ⏸️ MANUAL REQUIRED

The database migration adds two fields to `governance_votes`:
- `onchain_recorded_at` - Tracks when vote was posted to blockchain
- `pod_id` - Links vote to specific pod

**Action Required:**
1. Go to Supabase Dashboard SQL Editor:
   https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/sql

2. Copy and paste this SQL:

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

3. Click "Run"

4. Verify success by checking if columns exist:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'governance_votes'
AND column_name IN ('onchain_recorded_at', 'pod_id');
```

---

### Step 2: Prepare Smart Contract Deployment ⏸️ MANUAL REQUIRED

Before deploying the PodGovernance contract, ensure:

**Prerequisites:**
1. ✅ Hardhat installed (check with `npx hardhat --version`)
2. ⏸️ Deployer wallet has ETH on Base network for gas
3. ⏸️ Create backend service wallet for vote recording (separate from deployer)

**Configuration:**
- Advocate Token: `0x3Ad7e51578294366035ea41aAf0A15f6037a3789` (verified human membership)
- Network: Base mainnet
- Initial Vote Recorder: Will be deployer address (update later)

---

### Step 3: Deploy PodGovernance Contract ⏸️ READY

Once prerequisites are met:

```bash
# Compile contract (COMPLETED ✅)
npx hardhat compile

# Deploy to Base mainnet
npx hardhat run scripts/deploy-pod-governance.cjs --network base

# IMPORTANT: Save the deployed contract address!
# Example output:
# ✅ PodGovernance deployed to: 0x...
```

**Alternative: Deploy to Base Sepolia (Testnet)**

If you want to test first on testnet:
```bash
npx hardhat run scripts/deploy-pod-governance.cjs --network base-sepolia
```

**Note:** Contract successfully compiles (102 Solidity files). The `supports` parameter has been renamed to `supportValues` to avoid Solidity 0.8.20 reserved keyword collision.

---

### Step 4: Update Environment Variables ⏸️ PENDING

After contract deployment, add to `.env`:

```env
# PodGovernance contract address (from deployment output)
NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS=0x...

# Vote recorder service wallet (create new wallet for security)
VOTE_RECORDER_PRIVATE_KEY=0x...

# Pinata configuration (already configured ✅)
PINATA_JWT=eyJhbGci... # Already set
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
```

**Security Note:**
- Create a NEW wallet specifically for vote recording
- This wallet only needs to record votes (batching service)
- Keep private key secure
- Monitor wallet for unauthorized transactions

---

### Step 5: Update Vote Recorder on Contract ⏸️ PENDING

After creating the service wallet, update the contract:

1. Create script to call `setVoteRecorder()`:

```typescript
// scripts/set-vote-recorder.ts
import { ethers } from "hardhat";

async function main() {
  const POD_GOVERNANCE_ADDRESS = "0x..."; // From Step 3
  const NEW_VOTE_RECORDER = "0x..."; // Service wallet address

  const podGovernance = await ethers.getContractAt("PodGovernance", POD_GOVERNANCE_ADDRESS);

  console.log(`Setting vote recorder to: ${NEW_VOTE_RECORDER}`);
  const tx = await podGovernance.setVoteRecorder(NEW_VOTE_RECORDER);
  await tx.wait();

  console.log("✅ Vote recorder updated!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

2. Run script:
```bash
npx hardhat run scripts/set-vote-recorder.ts --network base
```

---

### Step 6: Verify Contract on Basescan ⏸️ PENDING

Make contract source code public and verifiable:

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> 0x3Ad7e51578294366035ea41aAf0A15f6037a3789 <VOTE_RECORDER_ADDRESS>
```

Example:
```bash
npx hardhat verify --network base 0x123... 0x3Ad7e51578294366035ea41aAf0A15f6037a3789 0x456...
```

Once verified, you can:
- View contract on Basescan
- Read contract events
- Verify vote signatures publicly

---

### Step 7: Implement Background Services ⏸️ PENDING

Two services need to run continuously:

**Option A: Vercel Cron Jobs (Recommended)**

Create two API routes:

1. **Vote Recording Cron** (`app/api/cron/record-votes/route.ts`):
```typescript
import { VoteRecordingService } from '@/services/voteRecordingService';

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

2. **IPFS Aggregation Cron** (`app/api/cron/aggregate-votes/route.ts`):
```typescript
import { IPFSAggregationService } from '@/services/ipfsAggregationService';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Check for closed proposals
  await IPFSAggregationService.checkAndAggregateClosedProposals();

  return Response.json({ success: true });
}
```

3. **Configure Vercel Cron** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/record-votes",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/aggregate-votes",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

4. **Add CRON_SECRET to environment variables**

**Option B: Dedicated Background Worker**

Create `services/background-worker.ts`:
```typescript
import { VoteRecordingService } from './voteRecordingService';
import { IPFSAggregationService } from './ipfsAggregationService';

// Start both services
VoteRecordingService.startBatchService();
IPFSAggregationService.startAggregationService();

console.log('✅ Background services started');
```

Then run with:
```bash
node services/background-worker.ts
```

---

### Step 8: Test End-to-End Flow ⏸️ PENDING

Complete test checklist:

1. **Create Pod-Level Proposal**
   - [ ] Create proposal for Temporal Naturalism pod
   - [ ] Verify proposal appears on-chain (Basescan)
   - [ ] Verify proposal saved to `pod_level_proposals` table

2. **Vote on Proposal**
   - [ ] Vote with governance permission ON
   - [ ] Verify vote saved to `governance_votes` table
   - [ ] Verify signature is present
   - [ ] Verify `onchain_recorded_at` is NULL (not yet recorded)

3. **Test Permission System**
   - [ ] Toggle governance permission OFF
   - [ ] Verify proposal still visible in "All Proposals"
   - [ ] Verify proposal NOT in "My Proposals"
   - [ ] Verify voting buttons show permission message

4. **Test Batch Recording**
   - [ ] Wait 5 minutes (or trigger manually)
   - [ ] Verify `onchain_recorded_at` is updated
   - [ ] Verify `PodVoteRecorded` event on Basescan
   - [ ] Verify signature matches on-chain

5. **Test IPFS Aggregation**
   - [ ] Wait for proposal deadline to pass
   - [ ] Wait 10 minutes (or trigger manually)
   - [ ] Verify vote manifest uploaded to Pinata
   - [ ] Verify `VotesAggregated` event with IPFS hash
   - [ ] Verify proposal status updated to 'approved' or 'rejected'
   - [ ] View IPFS manifest at: https://gateway.pinata.cloud/ipfs/{hash}

---

## 🔧 Troubleshooting

### Votes Not Recording On-Chain

**Symptoms:**
- `onchain_recorded_at` remains NULL
- No `PodVoteRecorded` events on Basescan

**Check:**
1. Is `NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS` set in .env?
2. Is vote recorder service running?
3. Does vote recorder wallet have gas (ETH)?
4. Check service logs for errors

### IPFS Upload Failing

**Symptoms:**
- No IPFS hash in proposal metadata
- No `VotesAggregated` event

**Check:**
1. Is `PINATA_JWT` valid?
2. Check Pinata dashboard for quota/limits
3. Check network connectivity
4. View service logs

### Contract Call Failing

**Symptoms:**
- Transaction reverts
- "Not an Advocate" error

**Check:**
1. Does voter hold Advocate token?
2. Has voter already voted? (check `hasVoted` mapping)
3. Is vote recorder wallet authorized?
4. View transaction on Basescan for revert reason

---

## 📊 Monitoring

Once deployed, monitor these:

1. **Basescan Events**
   - `PodVoteRecorded` events (every 5 minutes)
   - `VotesAggregated` events (when proposals close)
   - `ProposalFinalized` events

2. **Database Queries**
   ```sql
   -- Unrecorded votes
   SELECT COUNT(*) FROM governance_votes WHERE onchain_recorded_at IS NULL;

   -- Recent recordings
   SELECT * FROM governance_votes
   WHERE onchain_recorded_at IS NOT NULL
   ORDER BY onchain_recorded_at DESC LIMIT 10;
   ```

3. **Pinata Dashboard**
   - Check storage usage
   - Verify files are pinned
   - Monitor API usage

---

## 🎯 Success Criteria

You'll know the system is working when:

1. ✅ Users can create pod-level proposals that go on-chain
2. ✅ Users can vote with cryptographic signatures
3. ✅ Votes appear on Basescan within 5-10 minutes
4. ✅ Closed proposals aggregate to IPFS automatically
5. ✅ Anyone can verify votes are authentic via signatures
6. ✅ Pod permissions correctly control voting access
7. ✅ Zero gas fees for users (CDP sponsorship)

---

## 📚 Reference

- Architecture: `ONCHAIN_GOVERNANCE_ARCHITECTURE.md`
- PodGovernance Contract: `contracts/PodGovernance.sol`
- Vote Recording Service: `src/services/voteRecordingService.ts`
- IPFS Aggregation Service: `src/services/ipfsAggregationService.ts`
- Database Migration: `supabase/migrations/20260122000002_add_onchain_recording_fields.sql`

---

## 🚀 Next After Deployment

Once this system is live, consider these enhancements:

1. **Real-Time On-Chain Recording** - Record each vote immediately instead of batching
2. **Zero-Knowledge Proofs** - Private voting with public verification
3. **On-Chain Execution** - Approved proposals automatically execute
4. **Cross-Chain Governance** - Vote on Base, execute on other chains

---

**Last Updated:** 2026-01-22
**Status:** Infrastructure complete, awaiting deployment
