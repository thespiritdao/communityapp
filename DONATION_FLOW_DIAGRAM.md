# SpiritDAO Donation & $SYSTEM Token Flow Diagram

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPIRITDAO DONATION SYSTEM                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   FIAT IN    │ ──────► │   $SYSTEM    │ ──────► │  FIAT OUT    │
│  (Donation)  │         │   (Tokens)   │         │   (Burn)     │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## Flow 1: Donation → Token Minting

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER DONATION FLOW                         │
└─────────────────────────────────────────────────────────────────────┘

    [User]
      │
      │ Opens DonationModal
      ▼
┌──────────────────┐
│ DonationModal.tsx│
│                  │  User enters:
│  - Amount ($)    │  - $100
│  - Email         │  - user@example.com
└────────┬─────────┘
         │
         │ POST /api/donations/initiate
         ▼
┌─────────────────────────────────────┐
│  /api/donations/initiate/route.ts  │
│                                     │
│  1. Calculate fees (7.5%)           │
│     Donation: $100.00               │
│     Fee:      -$7.50                │
│     Net:      $92.50                │
│                                     │
│  2. Create DB record:               │
│     donations table                 │
│     status: 'pending'               │
│                                     │
│  3. Call Mercury API:               │
│     createPaymentLink()             │
└────────┬────────────────────────────┘
         │
         │ Returns payment URL
         ▼
    [Redirect to Mercury Payment Page]
         │
         │ User completes payment
         │ (Credit card / ACH)
         ▼
┌─────────────────────────────────────┐
│      MERCURY PAYMENT GATEWAY        │
│                                     │
│  - Process payment                  │
│  - Validate funds                   │
│  - Send webhook notification        │
└────────┬────────────────────────────┘
         │
         │ POST webhook
         ▼
┌─────────────────────────────────────┐
│  /api/donations/webhook/route.ts   │
│                                     │
│  1. Verify signature                │
│  2. Update DB:                      │
│     status: 'completed'             │
│     provider_tx_id: 'merc_123'      │
│                                     │
│  3. Trigger token minting:          │
│     SystemTokenService.mint()       │
└────────┬────────────────────────────┘
         │
         │ Call minting service
         ▼
┌─────────────────────────────────────┐
│    SystemTokenService.ts            │
│                                     │
│  1. Calculate tokens:               │
│     $92.50 = 92.50 $SYSTEM          │
│     (with 18 decimals)              │
│                                     │
│  2. Sign transaction:               │
│     Using MINTER_ROLE private key   │
│                                     │
│  3. Call smart contract:            │
│     systemToken.mint(              │
│       userAddress,                  │
│       92500000000000000000          │
│     )                               │
└────────┬────────────────────────────┘
         │
         │ Blockchain transaction
         ▼
┌─────────────────────────────────────┐
│   SystemToken.sol (Base Mainnet)    │
│                                     │
│  function mint(address to,          │
│                uint256 amount) {    │
│                                     │
│    require(hasRole(MINTER_ROLE));   │
│    _mint(to, amount);               │
│    emit TokensMinted(...);          │
│  }                                  │
└────────┬────────────────────────────┘
         │
         │ Transaction confirmed
         ▼
┌─────────────────────────────────────┐
│     Update Database                 │
│                                     │
│  donations:                         │
│    token_mint_status: 'minted'      │
│    token_mint_tx_hash: '0x...'      │
│                                     │
│  system_token_balances:             │
│    balance: 92.50                   │
└────────┬────────────────────────────┘
         │
         │ Notify user
         ▼
    [Email Confirmation]

    Subject: Your $SYSTEM tokens are ready!
    Amount: 92.50 $SYSTEM
    Tx Hash: 0x...

    [User Wallet Updated]
    Balance: 92.50 $SYSTEM
```

---

## Flow 2: Token Transfer to Pod Treasury

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TOKEN TO POD TREASURY FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

    [User with $SYSTEM tokens]
      │
      │ Navigate to Pod Page
      ▼
┌──────────────────────────┐
│ TreasuryManagement.tsx   │
│                          │
│  Display:                │
│  - $SYSTEM: 92.50        │
│  - Pod Treasury Info     │
│                          │
│  [Fund Pod Treasury] btn │
└────────┬─────────────────┘
         │
         │ User clicks "Fund Treasury"
         ▼
┌──────────────────────────┐
│  FundingModal            │
│                          │
│  Select:                 │
│  - Token: $SYSTEM        │
│  - Amount: 50            │
│  - Recipient: Pod        │
└────────┬─────────────────┘
         │
         │ Submit transaction
         ▼
┌─────────────────────────────────────┐
│  SystemTokenPodService.ts           │
│                                     │
│  prepareTransfer():                 │
│  - From: user wallet                │
│  - To: pod treasury address         │
│  - Amount: 50 $SYSTEM               │
│                                     │
│  Use CDP Smart Account:             │
│  - Gas sponsored by paymaster       │
│  - Via TreasuryProxy                │
└────────┬────────────────────────────┘
         │
         │ Call smart contract
         ▼
┌─────────────────────────────────────┐
│  TreasuryProxy.sol                  │
│                                     │
│  proxyReceiveTokens(                │
│    podId: "exec-pod-123",           │
│    token: SYSTEM_TOKEN_ADDRESS,     │
│    amount: 50000000000000000000     │
│  )                                  │
│                                     │
│  1. Transfer from user to proxy     │
│  2. Approve treasury                │
│  3. Call treasury.receiveTokens()   │
└────────┬────────────────────────────┘
         │
         │
         ▼
┌─────────────────────────────────────┐
│  PodTreasury.sol                    │
│                                     │
│  receiveTokens():                   │
│  - Verify token supported           │
│  - Update balance mapping           │
│  - Emit TokensReceived event        │
└────────┬────────────────────────────┘
         │
         │ Transaction confirmed
         ▼
┌─────────────────────────────────────┐
│  Update Database                    │
│                                     │
│  treasury_transactions:             │
│    type: 'deposit'                  │
│    pod_id: 'exec-pod-123'           │
│    amount: 50 $SYSTEM               │
│    sender: user address             │
│    status: 'completed'              │
│                                     │
│  pods:                              │
│    system_token_balance: 50         │
└────────┬────────────────────────────┘
         │
         │
         ▼
    [UI Updates]

    User Balance: 92.50 - 50 = 42.50 $SYSTEM
    Pod Treasury: 50 $SYSTEM
```

---

## Flow 3: Token Burn → Fiat Payout

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BURN & PAYOUT FLOW                             │
└─────────────────────────────────────────────────────────────────────┘

    [User with $SYSTEM tokens]
      │
      │ Click "Redeem for USD"
      ▼
┌──────────────────────────┐
│  BurnRequestForm.tsx     │
│                          │
│  Enter:                  │
│  - Amount: 42.50 $SYSTEM │
│  - Payout: ACH           │
│  - Routing: 123456789    │
│  - Account: 987654321    │
│  - Name: John Doe        │
└────────┬─────────────────┘
         │
         │ Check KYC threshold
         ▼
┌─────────────────────────────────────┐
│  KYC Check                          │
│                                     │
│  IF amount >= $1,000:               │
│    → Trigger Plaid Identity         │
│    → Verify user                    │
│    → Store kyc_data                 │
│  ELSE:                              │
│    → Skip KYC                       │
└────────┬────────────────────────────┘
         │
         │ POST /api/burn-requests/create
         ▼
┌─────────────────────────────────────┐
│  /api/burn-requests/create/route.ts│
│                                     │
│  1. Validate token balance          │
│  2. Calculate USD equivalent:       │
│     42.50 $SYSTEM = $42.50 USD      │
│                                     │
│  3. Create DB record:               │
│     burn_requests table             │
│     status: 'pending_approval'      │
│                                     │
│  4. Notify Exec Pod members         │
└────────┬────────────────────────────┘
         │
         │ Send notifications
         ▼
┌─────────────────────────────────────┐
│   Notify Executive Pod              │
│                                     │
│  - Email to exec pod leaders        │
│  - In-app notification              │
│  - Dashboard update                 │
└─────────────────────────────────────┘
         │
         │ Exec pod member logs in
         ▼
┌──────────────────────────┐
│  BurnApprovalDashboard   │
│  (/admin/burn-approvals) │
│                          │
│  Pending Requests:       │
│  ┌────────────────────┐  │
│  │ User: John Doe     │  │
│  │ Amount: 42.50      │  │
│  │ Payout: ACH        │  │
│  │ Bank: *****4321    │  │
│  │                    │  │
│  │ [Approve] [Reject] │  │
│  └────────────────────┘  │
└────────┬─────────────────┘
         │
         │ Exec member clicks "Approve"
         ▼
┌─────────────────────────────────────┐
│  Verify Exec Pod Permission         │
│                                     │
│  Check HAT balance:                 │
│    hatsContract.balanceOf(          │
│      execMemberAddress,             │
│      EXEC_MANAGEMENT_HAT_ID         │
│    )                                │
│                                     │
│  IF balance > 0:                    │
│    → Authorized ✓                   │
│  ELSE:                              │
│    → Reject (403)                   │
└────────┬────────────────────────────┘
         │
         │ Authorized
         ▼
┌─────────────────────────────────────┐
│  /api/burn-requests/approve/route  │
│                                     │
│  1. Update DB:                      │
│     status: 'approved'              │
│     approved_by: exec member        │
│     approved_at: timestamp          │
│                                     │
│  2. Trigger burn:                   │
│     SystemTokenService.burnTokens() │
└────────┬────────────────────────────┘
         │
         │ Execute burn
         ▼
┌─────────────────────────────────────┐
│  SystemTokenService.ts              │
│                                     │
│  burnTokens():                      │
│  1. Sign transaction with           │
│     BURNER_ROLE private key         │
│                                     │
│  2. Call smart contract:            │
│     systemToken.burnFrom(           │
│       userAddress,                  │
│       42500000000000000000          │
│     )                               │
└────────┬────────────────────────────┘
         │
         │ Blockchain transaction
         ▼
┌─────────────────────────────────────┐
│  SystemToken.sol                    │
│                                     │
│  burnFrom(address account,          │
│           uint256 amount) {         │
│                                     │
│    require(hasRole(BURNER_ROLE));   │
│    _burn(account, amount);          │
│    emit TokensBurned(...);          │
│  }                                  │
└────────┬────────────────────────────┘
         │
         │ Burn confirmed
         ▼
┌─────────────────────────────────────┐
│  Update Database                    │
│                                     │
│  burn_requests:                     │
│    burn_tx_hash: '0x...'            │
│    burn_tx_status: 'confirmed'      │
│    status: 'processing_payout'      │
└────────┬────────────────────────────┘
         │
         │ Initiate payout
         ▼
┌─────────────────────────────────────┐
│  PayoutService.ts                   │
│                                     │
│  initiatePayoutForBurnRequest():    │
│  1. Get bank details from DB        │
│  2. Call Mercury API:               │
│     mercury.createACHTransfer({     │
│       amount: 42.50,                │
│       routing: '123456789',         │
│       account: '987654321',         │
│       name: 'John Doe'              │
│     })                              │
└────────┬────────────────────────────┘
         │
         │ Mercury processes ACH
         ▼
┌─────────────────────────────────────┐
│  Mercury Banking                    │
│                                     │
│  - Validate bank details            │
│  - Initiate ACH transfer            │
│  - Estimated: 1-3 business days     │
│  - Send webhook on completion       │
└────────┬────────────────────────────┘
         │
         │ ACH completes
         ▼
┌─────────────────────────────────────┐
│  Mercury Webhook                    │
│  /api/burn-requests/payout-webhook  │
│                                     │
│  Update DB:                         │
│    status: 'completed'              │
│    payout_completed_at: timestamp   │
│    payout_provider_tx_id: 'merc_...'│
└────────┬────────────────────────────┘
         │
         │
         ▼
    [Email User]

    Subject: Your payout is complete!
    Amount: $42.50 USD
    Bank: *****4321

    [User Bank Account]
    + $42.50 USD deposited
```

---

## System State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM STATES                                │
└─────────────────────────────────────────────────────────────────────┘

DONATION STATES:
pending → completed → minted
         └→ failed

BURN REQUEST STATES:
pending_approval → approved → processing_payout → completed
                └→ rejected

TOKEN LIFECYCLE:
[Minted] → [User Wallet] → [Pod Treasury] → [Burned]
    ↑                            │               ↓
    │                            └──────────────[Payout]
    │                                            │
    └────────────────────────────────────────────┘
                    (Circular Economy)
```

---

## Database Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DATABASE SCHEMA                                │
└─────────────────────────────────────────────────────────────────────┘

user_profiles
├── wallet_address (PK)
├── payout_info (JSONB)
├── kyc_status
└── kyc_data (encrypted)
    │
    ├── [1:N] donations
    │   ├── id (PK)
    │   ├── user_wallet (FK)
    │   ├── amount_usd_cents
    │   ├── platform_fee_cents
    │   ├── net_amount_cents
    │   ├── status
    │   ├── token_mint_tx_hash
    │   └── system_tokens_issued
    │
    ├── [1:N] burn_requests
    │   ├── id (PK)
    │   ├── user_wallet (FK)
    │   ├── amount_tokens
    │   ├── amount_usd_cents
    │   ├── status
    │   ├── approved_by_wallet
    │   ├── burn_tx_hash
    │   └── payout_provider_tx_id
    │
    └── [1:1] system_token_balances
        ├── wallet_address (FK)
        ├── balance
        ├── onchain_balance
        └── last_synced

pods
├── id (PK)
├── treasury_address
├── system_token_balance
└── accepts_system_tokens
    │
    └── [1:N] treasury_transactions
        ├── id (PK)
        ├── pod_id (FK)
        ├── treasury_address
        ├── type (deposit/distribution/withdrawal)
        ├── token_address
        ├── amount_raw
        ├── sender_address
        ├── recipient_address
        └── tx_hash
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────┘

Layer 1: Smart Contract
┌─────────────────────────────────────┐
│  SystemToken.sol                    │
│                                     │
│  ✓ Role-based access (RBAC)         │
│  ✓ Pausable (emergency stop)        │
│  ✓ Reentrancy guards                │
│  ✓ Audited code                     │
└─────────────────────────────────────┘

Layer 2: Backend API
┌─────────────────────────────────────┐
│  Next.js API Routes                 │
│                                     │
│  ✓ Webhook signature verification   │
│  ✓ Rate limiting                    │
│  ✓ Input validation                 │
│  ✓ Private key isolation            │
└─────────────────────────────────────┘

Layer 3: Database
┌─────────────────────────────────────┐
│  Supabase PostgreSQL                │
│                                     │
│  ✓ Row-level security (RLS)         │
│  ✓ Encrypted fields (KYC data)      │
│  ✓ Foreign key constraints          │
│  ✓ Audit logs                       │
└─────────────────────────────────────┘

Layer 4: Payment Provider
┌─────────────────────────────────────┐
│  Mercury Banking                    │
│                                     │
│  ✓ PCI DSS compliance               │
│  ✓ ACH fraud detection              │
│  ✓ Webhook authentication           │
│  ✓ FDIC insured                     │
└─────────────────────────────────────┘

Layer 5: Governance
┌─────────────────────────────────────┐
│  Executive Pod (HAT-based)          │
│                                     │
│  ✓ Multi-signature approvals        │
│  ✓ HAT eligibility checks           │
│  ✓ Revocation governance            │
│  ✓ Audit trail                      │
└─────────────────────────────────────┘
```

---

## End-to-End Example

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE USER JOURNEY                            │
└─────────────────────────────────────────────────────────────────────┘

Day 1: Alice Donates
  08:00 - Opens SpiritDAO app
  08:05 - Navigates to "Support Us" page
  08:10 - Clicks "Donate" button
  08:15 - Enters $100, email: alice@example.com
  08:20 - Redirected to Mercury payment page
  08:25 - Completes credit card payment
  08:30 - Returns to app, sees "Processing..."
  08:32 - Mercury webhook received
  08:33 - Tokens minting initiated
  08:35 - Transaction confirmed on Base
  08:36 - Email: "You received 92.50 $SYSTEM!"
  08:37 - Wallet shows: 92.50 $SYSTEM

Day 1: Alice Funds Pod
  09:00 - Navigates to "Developer Pod" page
  09:05 - Clicks "Treasury" tab
  09:10 - Clicks "Fund Treasury"
  09:15 - Selects: 50 $SYSTEM
  09:20 - Confirms transaction (gas-free via CDP)
  09:21 - Transaction confirmed
  09:22 - Pod treasury: 50 $SYSTEM
  09:23 - Alice balance: 42.50 $SYSTEM

Day 7: Alice Cashes Out
  10:00 - Needs fiat for expenses
  10:05 - Clicks "Redeem for USD"
  10:10 - Enters: 42.50 $SYSTEM
  10:15 - Adds bank: routing + account
  10:20 - Submits burn request
  10:21 - Status: "Pending Approval"
  10:25 - Notification sent to Exec Pod

Day 7: Bob (Exec Pod) Approves
  14:00 - Opens admin dashboard
  14:05 - Sees Alice's burn request
  14:10 - Reviews details
  14:15 - Clicks "Approve"
  14:16 - System verifies Bob's HAT
  14:17 - Tokens burned on blockchain
  14:18 - Mercury payout initiated
  14:20 - Alice notified: "Payout in 1-3 days"

Day 10: Alice Receives Money
  09:00 - Checks bank account
  09:01 - + $42.50 USD deposited
  09:02 - Email: "Payout complete!"

Total cycle: 9 days (donation → usage → cashout)
```

---

**Legend**:
- `┌─┐` Boxes = Components/Services
- `│` Lines = Data flow
- `[Text]` = User actions
- `→` Arrows = Process direction
- `✓` Checkmarks = Security features
