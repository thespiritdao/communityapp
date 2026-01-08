# Documentation Cleanup Recommendations

**Created:** December 17, 2025
**Purpose:** Consolidate CDP documentation to single source of truth

---

## ✅ KEEP - Active Documentation

### 1. **CDP_SMART_WALLET_ARCHITECTURE.md** ⭐ PRIMARY REFERENCE
**Status:** Production-ready, proven working solution
**Contains:** Complete guide to Smart Wallet transactions with `useSendUserOperation`
**Proof:** User operation hash from successful faucet claim

### 2. **CDP_MIGRATION_PLAN.md** ⭐ IMPLEMENTATION GUIDE
**Status:** Ready for review
**Contains:** Step-by-step plan for migrating app to Smart Wallets
**Estimated Effort:** 2-3 days

---

## ❌ ARCHIVE/DELETE - Obsolete Documentation

### Pre-Breakthrough Documents (Wrong Approach)

1. **CDP_DEBUGGING_JOURNEY.md** (Dec 16)
   - Documents failed attempts with wrong API
   - **Obsolete:** Before discovering `useSendUserOperation`

2. **CDP_DUAL_LAYER_EXPLAINED.md** (Dec 16)
   - Explained incorrect dual-layer with `from` field
   - **Obsolete:** Wrong schema understanding

3. **CDP_MIGRATION_GUIDE.md** (Dec 16)
   - Based on `useSendEvmTransaction` (wrong API)
   - **Obsolete:** Superseded by new architecture doc

4. **CDP_BREAKTHROUGH_ANALYSIS.md** (Dec 17)
   - Early analysis, incomplete understanding
   - **Obsolete:** Superseded by architecture doc

5. **CDP_ACCOUNT_INVESTIGATION.md** (Dec 17)
   - Investigative notes during debugging
   - **Obsolete:** Issue resolved

6. **CDP_ACCOUNT_TYPE_BREAKTHROUGH.md** (Dec 17)
   - Discovered EOA/Smart Account split
   - **Partial:** Incorporated into architecture doc

7. **CDP_DIAGNOSTIC_NEXT_STEPS.md** (Dec 17)
   - Diagnostic plan from debugging phase
   - **Obsolete:** Diagnosis complete

8. **CDP_EVMACCOUNT_CONFIRMED.md** (Dec 17)
   - Confirmed evmAccount parameter
   - **Obsolete:** Still wrong API at this point

9. **CDP_MINIMAL_TEST_PLAN.md** (Dec 17)
   - Test plan for `useSendEvmTransaction`
   - **Obsolete:** Wrong API

10. **CDP_FAUCET_FIX_COMPLETE.md** (Dec 17)
    - Documents faucet fix with `useSendEvmTransaction`
    - **Obsolete:** Wrong approach, later fixed with `useSendUserOperation`

11. **CDP_GAS_SPONSORSHIP_SOLUTION.md** (Dec 17)
    - Attempted paymaster with wrong API
    - **Obsolete:** Paymaster requires `useSendUserOperation`

12. **CDP_MIGRATION_AUDIT.md** (Dec 13)
    - Early migration audit
    - **Obsolete:** Superseded by migration plan

13. **CDP_MIGRATION_COMPLETE_AUDIT.md** (Dec 14)
    - Premature "complete" audit
    - **Obsolete:** Wasn't actually complete

14. **CDP_SESSION_PERSISTENCE_FIX.md** (Dec 14)
    - Session persistence issue
    - **Obsolete:** Different issue, resolved separately

---

### Faucet/Airdrop Documents (Experimental)

15. **AIRDROP_GUIDE.md** (Dec 15)
    - Experimental airdrop implementation
    - **Status:** Unclear if still needed

16. **AIRDROP_SOLUTION_GUIDE.md** (Dec 15)
    - Alternative airdrop solution
    - **Status:** Unclear if still needed

17. **FAUCET_DEPLOYMENT_GUIDE.md** (Dec 15)
    - Faucet contract deployment
    - **Keep if:** Faucet is production feature
    - **Archive if:** Just for testing

18. **FAUCET_QUICK_START.md** (Dec 15)
    - Quick reference for faucet
    - **Obsolete:** Superseded by architecture doc

19. **FAUCET_REMIX_QUICK_REFERENCE.md** (Dec 15)
    - Remix contract interaction
    - **Keep if:** Still using Remix
    - **Archive if:** Not needed

20. **FUND_FAUCET_VIA_REMIX.md** (Dec 15)
    - Funding instructions
    - **Keep if:** Still funding faucet
    - **Archive if:** Automated

---

## 📋 Recommended Actions

### Immediate (Before Migration)

```bash
# Create archive directory
mkdir -p docs/archive/cdp-debugging

# Move obsolete files
mv CDP_DEBUGGING_JOURNEY.md docs/archive/cdp-debugging/
mv CDP_DUAL_LAYER_EXPLAINED.md docs/archive/cdp-debugging/
mv CDP_MIGRATION_GUIDE.md docs/archive/cdp-debugging/
mv CDP_BREAKTHROUGH_ANALYSIS.md docs/archive/cdp-debugging/
mv CDP_ACCOUNT_INVESTIGATION.md docs/archive/cdp-debugging/
mv CDP_ACCOUNT_TYPE_BREAKTHROUGH.md docs/archive/cdp-debugging/
mv CDP_DIAGNOSTIC_NEXT_STEPS.md docs/archive/cdp-debugging/
mv CDP_EVMACCOUNT_CONFIRMED.md docs/archive/cdp-debugging/
mv CDP_MINIMAL_TEST_PLAN.md docs/archive/cdp-debugging/
mv CDP_FAUCET_FIX_COMPLETE.md docs/archive/cdp-debugging/
mv CDP_GAS_SPONSORSHIP_SOLUTION.md docs/archive/cdp-debugging/
mv CDP_MIGRATION_AUDIT.md docs/archive/cdp-debugging/
mv CDP_MIGRATION_COMPLETE_AUDIT.md docs/archive/cdp-debugging/
mv CDP_SESSION_PERSISTENCE_FIX.md docs/archive/cdp-debugging/

# Keep only current docs in root
# - CDP_SMART_WALLET_ARCHITECTURE.md
# - CDP_MIGRATION_PLAN.md
```

### Faucet/Airdrop Decision Needed

**Questions for user:**
1. Is the faucet a production feature or just testing?
2. Are airdrops part of production roadmap?
3. Still using Remix for contract interaction?

**If testing only:** Move to `docs/archive/experimental/`
**If production:** Keep in root or move to `docs/features/faucet/`

---

## 🎯 Final Documentation Structure (Proposed)

```
/
├── CDP_SMART_WALLET_ARCHITECTURE.md  ⭐ PRIMARY REFERENCE
├── CDP_MIGRATION_PLAN.md             ⭐ IMPLEMENTATION GUIDE
├── docs/
│   ├── features/
│   │   ├── faucet/                   (if production feature)
│   │   ├── governance/
│   │   └── marketplace/
│   └── archive/
│       ├── cdp-debugging/            (14 obsolete docs)
│       └── experimental/             (airdrop/testing docs)
```

---

## ✅ Benefits of Cleanup

1. **Clarity:** Only 2 docs to reference (architecture + migration)
2. **Accuracy:** No conflicting or obsolete information
3. **Maintenance:** Easier to keep docs up-to-date
4. **Onboarding:** New devs see clean, current docs
5. **Historical:** Archive preserves debugging journey if needed

---

## ⚠️ Before Deletion

1. ✅ Ensure all important insights from old docs are in architecture doc
2. ✅ Create archive directory (don't delete permanently)
3. ✅ Git commit before cleanup (easy rollback)
4. ✅ Review with team (if applicable)

---

**Recommended Command:**

```bash
# Create directories
mkdir -p docs/archive/cdp-debugging

# Move obsolete docs (14 files)
mv CDP_*.md docs/archive/cdp-debugging/ 2>/dev/null || true

# Keep only these 2 in root
git restore CDP_SMART_WALLET_ARCHITECTURE.md
git restore CDP_MIGRATION_PLAN.md

# Commit cleanup
git add .
git commit -m "docs: Archive obsolete CDP debugging documentation

- Moved 14 obsolete CDP docs to docs/archive/cdp-debugging/
- Kept only 2 production docs:
  - CDP_SMART_WALLET_ARCHITECTURE.md (primary reference)
  - CDP_MIGRATION_PLAN.md (implementation guide)
- All obsolete docs preserved in archive for historical reference"
```

---

_Run cleanup commands AFTER reviewing and confirming migration plan._
