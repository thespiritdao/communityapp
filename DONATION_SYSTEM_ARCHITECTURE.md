# 🏗️ SpiritDAO Donation & $SYSTEM Token Economy - Architecture Document

**Last Updated**: January 30, 2026
**Status**: Design Complete - Ready for Implementation
**Platform**: Base Mainnet (Chain ID: 8453)

---

## Executive Summary

This document outlines the complete architecture for SpiritDAO's donation-to-token economy, enabling:
- Fiat donations → $SYSTEM token minting
- Token transfers to pod treasuries
- Token burn → fiat payout system
- Executive Pod approval workflow

**Key Metrics**:
- Platform Fee: 7.5%
- Token Peg: 1 $SYSTEM = $1 USD
- KYC Threshold: $1,000 USD
- Payment Provider: Mercury
- Blockchain: Base (ERC-20 token)

---

## I. System Components

### A. Core Smart Contracts

1. **SystemToken.sol** (ERC-20)
   - Standard fungible token
   - Controlled minting/burning
   - Role-based access (MINTER_ROLE, BURNER_ROLE)
   - Pausable for emergencies

2. **TreasuryProxy.sol** (Existing)
   - Already deployed and whitelisted
   - Handles pod treasury interactions
   - Gas sponsorship enabled via Coinbase CDP

3. **PodTreasury.sol** (Existing)
   - Multi-signature support
   - HAT-based access control
   - Receives/distributes $SYSTEM tokens

### B. Payment Infrastructure

**Mercury Payment Provider**
- ACH transfers (primary)
- Credit card processing
- Webhook integration for real-time updates
- Payout automation for burn requests

### C. Database Schema

#### New Tables:

**donations**
- Tracks fiat → crypto conversions
- Links payment provider transactions
- Records token minting status

**system_token_balances**
- Cached user balances
- Synced from blockchain periodically
- Enables fast UI updates

**burn_requests**
- User redemption requests
- Approval workflow tracking
- Payout information storage

**user_profiles** (Updated)
- `payout_info` JSONB field
- `kyc_status` enum
- `kyc_data` encrypted storage

---

## II. User Flows

### Flow 1: Donation to Token Minting

```
User → DonationModal
  ↓
Mercury Payment Link (fiat transaction)
  ↓
Mercury Webhook → /api/donations/webhook
  ↓
Update database (status: completed)
  ↓
SystemTokenService.mintTokensForDonation()
  ↓
Blockchain: mint(userAddress, netAmount)
  ↓
User receives $SYSTEM in wallet
```

**Timeline**: ~2-5 minutes from payment to token receipt

### Flow 2: Token Transfer to Pod Treasury

```
User → TreasuryManagement UI
  ↓
Select pod treasury as recipient
  ↓
SystemTokenPodService.transferSystemTokensToPod()
  ↓
ERC-20 transfer() call via CDP Smart Account
  ↓
Treasury receives $SYSTEM
  ↓
treasury_transactions record created
```

**Gas**: Sponsored by Coinbase CDP Paymaster

### Flow 3: Token Burn & Fiat Payout

```
User → BurnRequestForm
  ↓
Submit: amount + payout details
  ↓
Database: burn_requests (status: pending_approval)
  ↓
Notify Executive Pod members
  ↓
Exec Pod Member → Approval Dashboard
  ↓
Approve/Reject decision
  ↓
If approved:
  SystemTokenService.burnTokens()
  ↓
  PayoutService.initiatePayoutForBurnRequest()
  ↓
  Mercury: ACH transfer to user
  ↓
  Update: status = completed
```

**Timeline**: 1-3 business days (pending exec approval)

---

## III. Fee Structure

### Platform Economics

**Example: $100 Donation**
```
Donation Amount:     $100.00
Platform Fee (7.5%): -$7.50
─────────────────────────────
Net to User:         $92.50
$SYSTEM Minted:      92.50 tokens
```

**Fee Breakdown**:
- Payment processor: ~3%
- Gas costs (minting): ~1-2%
- Platform revenue: ~3.5%

### Competitive Analysis
- Patreon: 5-12%
- GoFundMe: 2.9% + $0.30
- **SpiritDAO**: 7.5% (competitive for DAO space)

---

## IV. Security & Compliance

### A. Smart Contract Security

**SystemToken.sol Protections**:
- Role-based access control (OpenZeppelin)
- Pausable emergency stop
- Reentrancy guards
- Audit-ready code structure

**Recommended Actions**:
- [ ] Smart contract audit (OpenZeppelin, Trail of Bits)
- [ ] Testnet deployment & testing (Base Sepolia)
- [ ] Mainnet deployment with timelock
- [ ] Multi-sig admin control

### B. KYC/AML Compliance

**Thresholds**:
- Burns < $1,000: No KYC required
- Burns ≥ $1,000: KYC via Plaid Identity

**Process**:
1. User initiates burn request
2. If amount ≥ $1,000, prompt KYC
3. Plaid Identity verification
4. Store encrypted results in `user_profiles.kyc_data`
5. Proceed with burn approval

**Tax Reporting**:
- Issue 1099-MISC for payouts > $600/year
- Track cumulative payout amounts per user

### C. Regulatory Considerations

**Money Transmitter License**: May be required depending on jurisdiction
**Security Token Status**: $SYSTEM is utility token, not security
**Terms of Service**: Must include:
- Non-refundable donation policy
- Redemption terms and conditions
- Fee disclosure
- Jurisdictional restrictions

---

## V. Executive Pod Approval System

### Current Setup
**Executive Pod Details**:
- ID: `e35c9e25-d29f-4988-b1e8-2902e960b94c`
- Management HAT: `0x0000008800010000000000000000000000000000000000000000000000000000`
- Membership HAT: `0x0000008800010001000000000000000000000000000000000000000000000000`
- Leader Consensus Threshold: 3 leaders

### HAT-Based Verification

**Approval Logic**:
```typescript
async function canApproveBurnRequest(walletAddress: string): Promise<boolean> {
  const EXEC_POD_MANAGEMENT_HAT = "0x0000008800010000000000000000000000000000000000000000000000000000";

  // Check if user wears Executive Pod management HAT
  const balance = await hatsContract.balanceOf(walletAddress, EXEC_POD_MANAGEMENT_HAT);
  return balance > 0;
}
```

**Role Revocation** (Critical Question):

Current HAT Protocol capabilities:
1. **Admins CAN revoke HATs** from wearers
2. **Self-revocation** is possible (renounceHat)
3. **Peer revocation** (leader → leader) is NOT built-in

**Recommended Solution**:
- Implement custom revocation governance in `burn_requests` approval system
- Require majority vote (2 of 3 leaders) to revoke another leader's approval rights
- Use `hatEligibilityModule` to enforce revocation logic

**Implementation Approach**:
```solidity
// Custom eligibility module for exec pod
contract ExecPodEligibility is IHatsEligibility {
    mapping(address => bool) public revokedByGovernance;
    mapping(address => mapping(address => bool)) public revocationVotes;

    function proposeRevocation(address targetLeader) external onlyLeader {
        revocationVotes[targetLeader][msg.sender] = true;
        if (countRevocationVotes(targetLeader) >= THRESHOLD) {
            revokedByGovernance[targetLeader] = true;
        }
    }

    function getWearerStatus(address wearer, uint256 hatId)
        external view returns (bool eligible, bool standing)
    {
        return (!revokedByGovernance[wearer], true);
    }
}
```

---

## VI. Integration with Existing Infrastructure

### A. TreasuryProxy.sol Integration

**Already Supports**:
- ✅ `proxyReceiveTokens()` - Receive $SYSTEM into pod treasury
- ✅ `proxyDistributeTokens()` - Send $SYSTEM from treasury to members
- ✅ Multi-signature approvals via `proxyProposeDistribution()`
- ✅ Gas sponsorship (whitelisted for CDP paymaster)

**New Method Needed**:
```solidity
// Add to TreasuryProxy.sol
function proxyAcceptSystemTokens(
    string memory podId,
    uint256 amount
) external nonReentrant validPodTreasury(podId) {
    address treasury = treasuryFactory.getTreasuryForPod(podId);
    address systemToken = SYSTEM_TOKEN_ADDRESS; // Immutable constant

    // Transfer $SYSTEM from sender to treasury
    IERC20(systemToken).safeTransferFrom(msg.sender, treasury, amount);

    // Notify treasury
    IPodTreasury(treasury).receiveTokens(systemToken, amount);
}
```

### B. TreasuryManagement.tsx Integration

**Current Capabilities**:
- ✅ Token balance display
- ✅ Distribution UI (single/batch/equal)
- ✅ Transaction history
- ✅ Multi-sig proposal system

**Enhancements Needed**:
1. Add $SYSTEM token icon/branding
2. Detect $SYSTEM token automatically
3. Add "Accept Donation" button linking to DonationModal
4. Display $SYSTEM-specific analytics

**Code Addition**:
```typescript
// In TreasuryManagement.tsx, add to balances rendering:
const isSystemToken = token.symbol === 'SYSTEM' || token.symbol === '$SYSTEM';

{isSystemToken && (
  <div className="mt-2 flex gap-2">
    <Button size="sm" onClick={() => setShowDonationModal(true)}>
      <Plus className="h-4 w-4 mr-1" />
      Receive Donations
    </Button>
    <Button size="sm" variant="outline" onClick={() => setShowBurnModal(true)}>
      <ArrowUpCircle className="h-4 w-4 mr-1" />
      Redeem for USD
    </Button>
  </div>
)}
```

---

## VII. Environment Variables Required

### Mercury Payment Provider
```bash
# Mercury API credentials
MERCURY_API_KEY=your_mercury_api_key
MERCURY_SECRET_KEY=your_mercury_secret_key
MERCURY_WEBHOOK_SECRET=your_webhook_secret
MERCURY_ACCOUNT_ID=your_mercury_account_id

# Webhook endpoint (for Mercury to call)
NEXT_PUBLIC_MERCURY_WEBHOOK_URL=https://yourdomain.com/api/donations/webhook
```

### Smart Contract Addresses
```bash
# SystemToken contract (deploy first)
NEXT_PUBLIC_SYSTEM_TOKEN_ADDRESS=0x... # TBD after deployment

# Minter role wallet (server-side only - NEVER expose to client)
SYSTEM_TOKEN_MINTER_PRIVATE_KEY=0x... # Hot wallet for minting
SYSTEM_TOKEN_ADMIN_PRIVATE_KEY=0x...  # Cold wallet for admin functions
```

### KYC Provider (Plaid Identity)
```bash
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox # or production
```

### Existing (Already Set)
```bash
NEXT_PUBLIC_TREASURY_PROXY=0x... # Already deployed
```

---

## VIII. Private Key Management Strategy

### Problem
Smart contract needs MINTER_ROLE to mint $SYSTEM tokens server-side.

### Recommended Solution: Hot Wallet + Cold Wallet Pattern

**Hot Wallet** (Minter Operations):
- Holds MINTER_ROLE only
- Private key stored in environment variable
- Used by backend for automated minting
- Limited funds (just enough for gas)
- Monitored for suspicious activity

**Cold Wallet** (Admin Operations):
- Holds DEFAULT_ADMIN_ROLE
- Multi-sig (e.g., Gnosis Safe)
- Controlled by Executive Pod leaders
- Can revoke/grant roles
- Used for emergency pause/unpause

**Setup Process**:
```bash
# 1. Deploy SystemToken.sol via Remix (you control initial admin)
# 2. Create hot wallet for minting
HOT_WALLET=0xABC... # Generate new wallet

# 3. Grant MINTER_ROLE to hot wallet (via Remix or Hardhat)
await systemToken.grantRole(MINTER_ROLE, HOT_WALLET_ADDRESS);

# 4. Store hot wallet PK in .env (server-side only!)
SYSTEM_TOKEN_MINTER_PRIVATE_KEY=0x123abc...

# 5. Transfer admin to multi-sig (optional but recommended)
await systemToken.grantRole(DEFAULT_ADMIN_ROLE, MULTISIG_ADDRESS);
await systemToken.renounceRole(DEFAULT_ADMIN_ROLE, YOUR_ADDRESS);
```

**Security Best Practices**:
- Rotate hot wallet quarterly
- Monitor mint transactions daily
- Set up alerts for unusual patterns
- Keep cold wallet in hardware wallet (Ledger/Trezor)

---

## IX. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Deploy SystemToken.sol to Base Sepolia
- [ ] Set up Mercury account & API integration
- [ ] Create database migrations
- [ ] Implement DonationModal component
- [ ] Test donation → mint flow end-to-end

### Phase 2: Core Features (Weeks 3-4)
- [ ] Build SystemTokenService (minting logic)
- [ ] Create BurnRequestForm component
- [ ] Implement exec pod approval dashboard
- [ ] Set up Mercury payout webhook
- [ ] Test burn → approval → payout flow

### Phase 3: Integration (Week 5)
- [ ] Integrate $SYSTEM into TreasuryManagement.tsx
- [ ] Add SystemTokenPodService for pod transfers
- [ ] Update proxyReceiveTokens for $SYSTEM
- [ ] Test full user journey: donate → transfer to pod → burn

### Phase 4: Security & Compliance (Week 6)
- [ ] Smart contract audit
- [ ] Plaid Identity KYC integration
- [ ] Update Terms of Service
- [ ] Privacy policy for payment data

### Phase 5: Mainnet Launch (Week 7)
- [ ] Deploy SystemToken to Base Mainnet
- [ ] Switch Mercury to production mode
- [ ] Deploy updated frontend
- [ ] Monitor first 50 transactions

### Phase 6: Optimization (Week 8+)
- [ ] Analytics dashboard
- [ ] Batch minting optimization
- [ ] Referral rewards system (future)
- [ ] Recurring donation support (future)

---

## X. Risk Mitigation Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|---------|------------|
| Smart contract exploit | Low | Critical | Professional audit, bug bounty |
| Payment provider downtime | Medium | High | Fallback to Helcim, queue system |
| Insufficient fiat reserves | Medium | High | 30-day reserve requirement |
| Regulatory changes | Low | Critical | Legal review quarterly |
| KYC provider issues | Low | Medium | Backup provider (Persona/Onfido) |
| Gas price spike | Medium | Low | Batch operations during low gas |
| Exec pod approval delays | Medium | Medium | Auto-approve < $500 after 48hrs |

---

## XI. Success Metrics (3-Month Targets)

**Adoption**:
- 100 total donations
- $10,000 USD in donations
- 50 unique donors
- 20 pod treasuries holding $SYSTEM

**Operational**:
- <1% failed mints
- <24hr average burn approval time
- 99.9% uptime for donation flow
- 0 security incidents

**Financial**:
- $750 in platform fees collected
- 30-day reserve maintained
- <0.5% in gas costs

---

## XII. Open Questions & Decisions Needed

✅ **RESOLVED**:
- Exec Pod ID: `e35c9e25-d29f-4988-b1e8-2902e960b94c`
- Payment Provider: Mercury (account created)
- Token Name: $SYSTEM
- KYC Threshold: $1,000
- KYC Provider: Plaid Identity
- Fee Structure: 7.5%

⚠️ **PENDING**:
- [ ] HAT revocation governance model (majority vote implementation)
- [ ] Multi-sig admin wallet setup (Executive Pod leaders)
- [ ] Legal review for money transmitter license requirements
- [ ] Tax reporting automation (1099-MISC generation)

---

## XIII. Contact & Support

**Technical Lead**: TBD
**Smart Contract Auditor**: TBD (recommendations: OpenZeppelin, Trail of Bits)
**Legal Counsel**: TBD (needed for MSB registration)
**Mercury Account Manager**: [From Mercury onboarding]

**Documentation**:
- Hats Protocol: https://docs.hatsprotocol.xyz
- Mercury API: https://docs.mercury.com
- Plaid Identity: https://plaid.com/docs/identity-verification
- Base Network: https://docs.base.org

---

## Appendix A: Database Schema SQL

See: `supabase/migrations/20260130000000_create_donations.sql`
See: `supabase/migrations/20260130000001_create_system_token_balances.sql`
See: `supabase/migrations/20260130000002_create_burn_requests.sql`

## Appendix B: Smart Contract Code

See: `src/contracts/SystemToken.sol`

## Appendix C: API Route Specifications

See: `src/app/api/donations/*/route.ts`
See: `src/app/api/burn-requests/*/route.ts`

---

**End of Document**
