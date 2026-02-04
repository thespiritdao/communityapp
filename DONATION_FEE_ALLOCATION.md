# Donation Fee Allocation Policy

## Fee Structure

**Total Platform Fee: 7.5% of donation amount**

### Split:
- **5.0%** → Executive Pod Operations Treasury
- **2.5%** → Eight Dignities Public Goods Treasury

---

## Current Implementation

### Where Fees Go:
- **All 7.5%** currently remains in SpiritDAO's nonprofit bank account (connected to Stripe)
- Fees are **tracked in database** (`org_fee` column in `pending_donations` table)
- Distribution happens **manually** on a periodic basis

### Example ($100 donation):
```
User donates:              $100.00
Stripe processing fee:     -$2.90  (2.9% + $0.30)
Platform fee (7.5%):       -$7.50
────────────────────────────────────
User receives:             $89.60 in $SYSTEM tokens
Platform retains:          $7.50 in bank account
  → 5.0% ($5.00) Executive Pod allocation
  → 2.5% ($2.50) Dignities allocation
```

---

## Monthly Distribution Process

### Step 1: Calculate Allocations
Run SQL query to get total fees collected:

```sql
SELECT
  SUM(org_fee) as total_platform_fees,
  SUM(org_fee * 0.05 / 0.075) as exec_pod_allocation,
  SUM(org_fee * 0.025 / 0.075) as dignities_allocation,
  COUNT(*) as donation_count
FROM pending_donations
WHERE status = 'minted'
  AND minted_at >= '2026-02-01'  -- Start of month
  AND minted_at < '2026-03-01';  -- End of month
```

### Step 2: Transfer Funds

**To Executive Pod Treasury:**
- Amount: 66.67% of collected fees (5% of 7.5%)
- Method: Bank transfer to Executive Pod multisig or treasury address

**To Dignities Treasury:**
- Amount: 33.33% of collected fees (2.5% of 7.5%)
- Method: Bank transfer to Dignities multisig or treasury address

### Step 3: Record in Database

Insert records to track distributions:

```sql
INSERT INTO fee_distributions (
  period_start,
  period_end,
  total_fees,
  exec_pod_amount,
  dignities_amount,
  distributed_at
) VALUES (
  '2026-02-01',
  '2026-03-01',
  450.00,  -- Total fees
  300.00,  -- 66.67% to Exec Pod
  150.00,  -- 33.33% to Dignities
  NOW()
);
```

---

## Future: Automated Distribution

Once volumes increase, we can automate:

### Option A: On-Chain Treasury Tokens
- Mint "Treasury Allocation Tokens" instead of USD transfers
- Executive Pod gets 66.67% of treasury tokens
- Dignities get 33.33% of treasury tokens
- Redeemable for USD from treasury

### Option B: Automatic Stripe Payouts
- Use Stripe Connect to split payouts automatically
- Separate bank accounts for each treasury
- Requires additional Stripe setup

---

## Database Schema (Future Enhancement)

```sql
-- Track fee distributions
CREATE TABLE fee_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_fees DECIMAL(10,2) NOT NULL,
  exec_pod_amount DECIMAL(10,2) NOT NULL,
  dignities_amount DECIMAL(10,2) NOT NULL,
  exec_pod_tx_hash TEXT,  -- On-chain transfer hash
  dignities_tx_hash TEXT, -- On-chain transfer hash
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Add index for period queries
CREATE INDEX idx_fee_distributions_period ON fee_distributions(period_start, period_end);
```

---

## Recommendations

### Phase 1 (Current - First 3 months):
- ✅ Keep manual monthly distributions
- ✅ Track in spreadsheet + database
- ✅ Simple reconciliation process
- ✅ Flexibility to adjust split if needed

### Phase 2 (After 100+ donations):
- Implement automated distribution
- Set up separate treasury wallets
- Create dashboard for fee tracking
- Automate monthly reports

---

## Environment Variable

The fee percentage is configurable:

```bash
# .env
DONATION_PLATFORM_FEE_PERCENTAGE=7.5  # Total platform fee

# Future: Add split percentages
EXEC_POD_FEE_PERCENTAGE=5.0
DIGNITIES_FEE_PERCENTAGE=2.5
```

---

## Tax Considerations (Consult CPA)

- Fees collected are **nonprofit revenue**
- Distribution to treasuries may have different tax treatment
- Document all distributions for 990 reporting
- Consult with nonprofit accountant before finalizing allocation strategy
