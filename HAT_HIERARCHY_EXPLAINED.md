# HAT Hierarchy Explanation for SpiritDAO Executive Pod

## Current Executive Pod Structure

**Pod ID**: `e35c9e25-d29f-4988-b1e8-2902e960b94c`
**Pod Name**: Executive Pod
**Parent Pod**: SpiritDAO (Top Hat wearer)

### HAT IDs Breakdown

```
SpiritDAO Top Hat
├── ID: 0x0000008800000000000000000000000000000000000000000000000000000000
│   (Tree 136, Level 0)
│
└── Executive Pod Management Hat
    ├── ID: 0x0000008800010000000000000000000000000000000000000000000000000000
    │   (Tree 136, Level 1, Position 1)
    │   Admin: SpiritDAO Top Hat (0x00000088...0000)
    │
    └── Executive Pod Membership Hat
        ├── ID: 0x0000008800010001000000000000000000000000000000000000000000000000
        │   (Tree 136, Level 2, Position 1)
        │   Admin: Executive Pod Management Hat (0x00000088...0100)
```

---

## Who Can Revoke Whom?

### Scenario 1: SpiritDAO Top Hat Wearer
**Who wears it?**: Unknown (check `pod_leads` of parent pod)
**Powers**:
- ✅ Can revoke Executive Pod Management Hat from leaders
- ✅ Can revoke Executive Pod Membership Hat from members
- ✅ Is the ultimate authority over all Executive Pod hats

**Important**: This is your "nuclear option" - the Top Hat can override everything.

---

### Scenario 2: Executive Pod Leader (Management Hat Wearer)
**Who wears it?**: `0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48` (from `pod_leads`)
**Powers**:
- ✅ Can mint/revoke **Membership Hat** (members)
- ❌ **CANNOT revoke another leader's Management Hat**
- ✅ Can renounce their own Management Hat (self-revoke)

**Why leaders can't revoke each other**:
- The Management Hat's admin is the **Top Hat**, not another Management Hat
- Only the Top Hat wearer can revoke a Management Hat
- This is by design in Hats Protocol to prevent lateral revocation

---

### Scenario 3: Executive Pod Member (Membership Hat Wearer)
**Who wears it?**: Any member accepted to the pod
**Powers**:
- ❌ Cannot revoke anyone
- ✅ Can renounce their own Membership Hat

---

## The Problem

**Your governance goal**: Leaders should be able to remove other leaders via majority vote.

**Hats Protocol limitation**: Leaders cannot revoke each other because they don't have admin authority over each other's hats.

**Current state**:
```
Top Hat (Ultimate Admin)
  │
  ├── Leader 1 (Management Hat) ← Admin is Top Hat
  ├── Leader 2 (Management Hat) ← Admin is Top Hat
  └── Leader 3 (Management Hat) ← Admin is Top Hat

Leader 1 CANNOT revoke Leader 2
Because Leader 1 does not wear Leader 2's admin hat (Top Hat)
```

---

## Solutions

### Option 1: Use HAT Eligibility Module (Recommended)

Instead of revoking the HAT, make leaders **ineligible** to wear it.

**How it works**:
1. Deploy a custom eligibility module contract
2. Set it as the Executive Pod Management Hat's eligibility module
3. Eligibility module implements governance voting
4. When majority votes "ineligible", the leader's HAT balance becomes 0

**Code example**:
```solidity
// ExecPodEligibilityModule.sol
contract ExecPodEligibilityModule is IHatsEligibility {
    mapping(address => bool) public revokedByGovernance;
    mapping(address => mapping(address => bool)) public revocationVotes;

    uint256 public constant REVOCATION_THRESHOLD = 2; // 2 of 3 leaders

    function getWearerStatus(address _wearer, uint256 _hatId)
        external view returns (bool eligible, bool standing)
    {
        // If revoked by governance, ineligible
        if (revokedByGovernance[_wearer]) {
            return (false, false); // Not eligible, bad standing
        }

        // Otherwise, eligible
        return (true, true);
    }

    function proposeRevocation(address _target) external {
        // Must be a leader to propose
        require(isLeader(msg.sender), "Only leaders can propose");
        require(_target != msg.sender, "Cannot revoke self");

        revocationVotes[_target][msg.sender] = true;

        // Count votes
        uint256 votes = countVotes(_target);
        if (votes >= REVOCATION_THRESHOLD) {
            revokedByGovernance[_target] = true;
        }
    }
}
```

**Advantages**:
- ✅ Leaders can effectively remove each other via voting
- ✅ Respects Hats Protocol design
- ✅ Reversible (can restore eligibility)
- ✅ Transparent (on-chain voting record)

**Disadvantages**:
- ⚠️ Requires smart contract deployment
- ⚠️ Requires updating the Management Hat's eligibility module

---

### Option 2: Top Hat Multi-Sig Control

Make the Top Hat owned by a multi-sig wallet controlled by leaders.

**How it works**:
1. Create Gnosis Safe with 2-of-3 leaders as signers
2. Transfer Top Hat to the Safe
3. To revoke a leader, 2 leaders sign a transaction calling `transferHat()`

**Advantages**:
- ✅ Works within Hats Protocol natively
- ✅ No custom contracts needed
- ✅ Proven pattern (multi-sig is battle-tested)

**Disadvantages**:
- ⚠️ Requires coordination (2 leaders must sign)
- ⚠️ Top Hat controls ALL pods, not just Executive Pod
- ⚠️ Risk: If 2 leaders collude, they control everything

---

### Option 3: Database-Enforced Governance (Your Current Approach)

Keep track of revocations in your Supabase database and enforce in application logic.

**How it works**:
1. Leaders vote to revoke in your app
2. Database marks leader as `revoked_by_governance: true`
3. Your app checks this flag before allowing actions
4. The HAT still exists on-chain, but your app ignores it

**Advantages**:
- ✅ Easiest to implement (no smart contracts)
- ✅ Flexible governance rules
- ✅ Reversible

**Disadvantages**:
- ❌ **Off-chain only** - other apps/contracts won't respect it
- ❌ Revoked leader can still call treasury smart contract directly
- ❌ Not enforceable on-chain

---

## Recommended Approach for SpiritDAO

**Hybrid: Option 1 + Option 3**

### Phase 1 (Immediate - No Smart Contracts)
Use database-enforced governance as described in my previous code:

```typescript
// src/features/pods/services/ExecPodGovernanceService.ts
export class ExecPodGovernanceService {
  static async proposeLeaderRevocation(
    targetWallet: string,
    proposerWallet: string,
    reason: string
  ): Promise<string> {
    // Create proposal in database
    const { data } = await supabase
      .from('exec_pod_revocation_proposals')
      .insert({
        target_wallet: targetWallet,
        proposed_by: proposerWallet,
        reason,
        votes_for: [proposerWallet],
      })
      .select()
      .single();

    return data.id;
  }

  static async voteOnRevocation(
    proposalId: string,
    voterWallet: string,
    vote: 'for' | 'against'
  ) {
    // Update votes
    const { data: proposal } = await supabase
      .from('exec_pod_revocation_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    const updatedVotes = vote === 'for'
      ? [...proposal.votes_for, voterWallet]
      : [...proposal.votes_against, voterWallet];

    // If threshold reached (2 of 3)
    if (updatedVotes.length >= 2) {
      await supabase
        .from('pod_members')
        .update({ revoked_by_governance: true })
        .eq('wallet_address', proposal.target_wallet);
    }
  }
}
```

**Then enforce in your app**:
```typescript
// In burn request approval logic:
async function canApproveBurnRequest(walletAddress: string): Promise<boolean> {
  // Check if they have the HAT
  const hasHat = await checkHatBalance(walletAddress, EXEC_MANAGEMENT_HAT_ID);

  // Check if revoked by governance
  const { data } = await supabase
    .from('pod_members')
    .select('revoked_by_governance')
    .eq('wallet_address', walletAddress)
    .eq('pod_id', EXEC_POD_ID)
    .single();

  // Must have HAT AND not be revoked
  return hasHat && !data?.revoked_by_governance;
}
```

### Phase 2 (Future - Smart Contract Upgrade)
Deploy eligibility module for on-chain enforcement:

```solidity
// When you're ready for full decentralization
// Deploy ExecPodEligibilityModule.sol
// Call: hats.changeHatEligibility(MANAGEMENT_HAT_ID, eligibilityModule)
```

---

## Summary Table

| Role | HAT ID | Admin HAT | Can Revoke |
|------|--------|-----------|------------|
| **SpiritDAO Top Hat Wearer** | 0x...0000 | Self (Top Hat) | Everyone in tree |
| **Exec Pod Leader** | 0x...0100 | Top Hat | Members only |
| **Exec Pod Member** | 0x...0101 | Management Hat | No one |

**Key Insight**:
- "Admin" in Hats Protocol = "the hat that controls this hat"
- "Leader" in your app = "someone wearing a management hat"
- Leaders are NOT admins of each other's hats
- Therefore, **leaders cannot directly revoke each other in Hats Protocol**

---

## Action Items

1. **Immediate**: Implement database-enforced governance (safe, off-chain)
2. **Short-term**: Add UI for leaders to propose/vote on revocations
3. **Medium-term**: Deploy eligibility module for on-chain enforcement
4. **Long-term**: Consider multi-sig Top Hat for ultimate security

---

## Questions to Answer

1. **Who currently wears the Top Hat?**
   - Check parent pod `pod_leads` to find out
   - This person has ultimate control

2. **How many leaders should Executive Pod have?**
   - Current threshold: 3 leaders
   - Revocation threshold: 2 of 3 (majority)

3. **Should revocation be reversible?**
   - Database approach: Yes (update flag)
   - HAT transfer approach: No (need to re-mint)

Let me know which approach you prefer, and I'll implement it!
