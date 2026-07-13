# SpiritDAO Quick Reference Guide

**For Sensemaker AI and User Support**

This document provides quick lookup for common questions and features across SpiritDAO.

---

## User Guide Index

### Available Guides
1. **Getting Started** (`01-getting-started.md`)
   - Onboarding, wallet setup, Advocate, basic navigation
2. **Pod Management** (`02-pod-management.md`)
   - Creating pods, joining pods, pod roles, modules, applications
3. **Governance & Voting** (`03-governance-voting.md`)
   - Proposals, voting, delegation, on-chain governance
4. **Bounties System** (`04-bounties-system.md`)
   - Task marketplace, applications, payments, escrow
5. **Events & Community Calendar** (`05-events-calendar.md`)
   - Event registration, NFT tickets, check-in, completion NFTs
6. **Forum & Discussions** (`06-forum-discussions.md`)
   - Threads, posts, moderation, pod forums
7. **Marketplace & Shopping** (`07-marketplace-shopping.md`)
   - Products, checkout, token payments, orders

---

## Quick Feature Lookup

### Core Concepts

**SpiritDAO** = Federated infrastructure for self-sovereign communities: a 501(c)(3) nonprofit (on Base blockchain) that lets communities own their data, governance, and treasury. Open to new communities and members: join one or organize your own.

**Advocate** = DAO membership accreditation (required for most features); shown under Accreditations on the identity page

**Hats Protocol** = Role-based access control using Hat tokens (NFTs)

**Smart Wallet** = Gasless transactions via Coinbase OnChainKit

**Base Network** = Ethereum Layer 2 (required chain)

**On-chain** = Recorded on blockchain (permanent, transparent, enforceable)

---

## Common User Questions

### "How do I get started?"
→ See: `01-getting-started.md`
- Connect wallet
- Mint Advocate (voting active immediately)
- Set up identity profile
- Join your first pod

### "How do I contact another member?"
→ Open their profile (from the Members directory) and use the **Message** button to start an in-app Direct Message. Member emails are not shown or clickable; email is private (used only for your own login and notifications, never shared with other members).

### "How do I join a pod?"
→ See: `02-pod-management.md` > Finding & Joining Pods
- Browse pods page
- View pod details
- Submit application
- Wait for leader approval
- Receive membership Hat

### "How do I vote on proposals?"
→ See: `03-governance-voting.md` > Voting on Proposals
- Must have Advocate (voting power is active immediately, auto-delegated on mint)
- Find active proposals
- Cast vote (For/Against/Abstain)
- Sign transaction

### "How do I create a proposal?"
→ See: `03-governance-voting.md` > Creating Proposals
- Must have Advocate (voting power active automatically)
- Discuss in forum first
- Navigate to governance page
- Fill proposal form (title, description, forum link)
- Submit and promote

### "How do I apply for a bounty?"
→ See: `04-bounties-system.md` > Applying for Bounties
- Check eligibility requirements
- View bounty details
- Submit application (approach, timeline, experience)
- Wait for approval
- Start work if selected

### "How do I register for an event?"
→ See: `05-events-calendar.md` > Registering for Events
- Check eligibility
- Click "Register Now"
- Pay fee if required
- Mint registration NFT
- Receive confirmation

### "How do I buy something in the marketplace?"
→ See: `07-marketplace-shopping.md` > Checkout Process
- Browse products
- Add to cart
- Select payment token ($SELF or $SYSTEM)
- Click "Approve & Purchase"
- Sign transaction

### "How do I create a pod?"
→ See: `02-pod-management.md` > Creating a Pod
- Must be Executive Pod member
- Click "Create Pod"
- Fill basic information
- Add pod leaders (minimum 2)
- Set eligibility criteria
- Enable modules
- Sign accountability agreement

---

## Permission Requirements

### Actions by Required Permissions

**Create Pods:**
- Executive Pod membership

**Create Proposals:**
- Advocate (voting power active automatically)

**Vote on Proposals:**
- Advocate (voting power active automatically, auto-delegated on mint)

**Apply for Bounties:**
- Wallet connected + meet bounty eligibility

**Create Bounties:**
- Pod leader OR bounty posting permission OR Executive Pod

**Register for Events:**
- Wallet connected + meet event requirements

**Create Events:**
- Pod leader OR event creation permission OR Executive Pod

**Post in Forums:**
- Depends on forum settings (Public, Members Only, Leaders Only)

**Create Products:**
- Pod membership + marketplace access + pod marketplace module enabled

**Manage Orders:**
- Executive Pod OR Market Management token

**Approve Pod Applications:**
- Pod leader

**Remove Pod Members:**
- Pod leader

---

## Role Definitions

### DAO-Wide Roles

**Advocate Holder:**
- Basic DAO membership
- Can vote (voting power active immediately)
- Can create proposals
- Access to public features

**Executive Pod Member:**
- Highest level access
- Can create pods
- Can create bounties/events DAO-wide
- Administrative privileges

### Pod-Specific Roles

**Pod Leader:**
- Manages specific pod
- Approves/rejects applications
- Can remove members
- Deploys pod modules
- Signs agreements for pod

**Pod Member:**
- Participates in pod activities
- Access to pod features
- Can post in pod forum (if enabled)
- Can apply for pod bounties

---

## Module Reference

### Pod Modules

Pod modules come in three kinds:
- **Core**: Chat, Forum, Treasury, Governance, Events, Bounties, Marketplace, Knowledge Base, Sub-Pods
- **Add-ons**: Surveys, Password Vault
- **Paid**: Community AI Agent (monthly $SYSTEM subscription)

**Forum Module:**
- Pod-specific discussion board
- Create threads and posts
- Leaders can moderate
- Members-only or public

**Events Module:**
- Pod-specific events
- Registration system with NFTs
- Attendance tracking
- Check-in functionality

**Bounty Module:**
- Pod task marketplace
- Funded from pod treasury
- Application and review system
- Escrow payments

**Treasury Module:**
- Multi-sig wallet
- Hold tokens (USDC, ETH, etc.)
- Fund bounties and expenses
- Transparent accounting

---

## Token Reference

### DAO Tokens

**$SELF (Participation Token):**
- Soulbound: earned only, never transferable or sellable
- Earned via participation: accredited events, bounties, verified work (~1 $SELF ≈ 1 verified hour)
- Spent only by burning ("burn-to-pay") for marketplace items, event tickets, access-gated activities (mints a soulbound receipt)
- Carries its origin (community + season); fades ~6 months after earning, then converts to permanent Tenure standing
- Pods hold a minting *budget*, not a balance
- Contract: `NEXT_PUBLIC_SELF_EPOCHS` (soulbound ERC-1155; legacy `NEXT_PUBLIC_SELF_TOKEN` ERC-20 retired)

**$SYSTEM (Utility Token):**
- Transferable ERC-20, backed 1:1 by capital held by the SpiritDAO nonprofit (1 $SYSTEM ≈ $1)
- Earned by exchanging dollars for $SYSTEM; on exchange, 8% is a donation (4% operations + 4% Community Pool)
- Used for events, bounties, marketplace, gifting, pod treasuries
- Burnable for fiat payout via Claims
- Contract: `NEXT_PUBLIC_SYSTEM_TOKEN`

**Advocate:**
- Governance membership accreditation; grants DAO-wide voting power (auto-delegated on mint, active immediately)
- Earned via first donation; shown under Accreditations on the identity page
- Free to mint

**Hat Tokens:**
- Role-based NFTs (Hats Protocol)
- Represent pod membership
- Represent leadership roles
- Represent permissions

---

## Blockchain Concepts

### Transaction Types

**Sponsored (Gasless):**
- Uses Smart Wallet
- No ETH required for gas
- DAO pays gas fees
- Faster, cleaner UX

**Standard:**
- Requires ETH for gas
- User pays fees
- Traditional wallet experience

**Approval:**
- Give contract permission to spend tokens
- One-time per token per contract
- Required before first purchase/transfer

**Multi-sig:**
- Requires multiple signatures
- Used for pod treasuries
- Increased security
- Transparent

### Governance States

**Proposal Lifecycle:**
0. Pending - Just created
1. Active - Voting open
2. Canceled - Creator canceled
3. Defeated - Not enough votes
4. Succeeded - Passed voting
5. Queued - Waiting for timelock
6. Expired - Timelock ended
7. Executed - Actions performed

### NFT Types

**Registration NFT:**
- Proof of event registration
- Created at registration
- Used for check-in

**Completion NFT:**
- Proof of attendance
- Minted after check-in
- Collectible achievement

**Advocate:**
- DAO membership accreditation
- Required for governance (voting active immediately, auto-delegated on mint)
- Shown under Accreditations on the identity page

**Hat Token:**
- Pod role representation
- Grants permissions
- Hierarchical structure

---

## Troubleshooting Quick Reference

### "Transaction Failed"
→ Check:
- Wallet connected?
- Correct network (Base)?
- Sufficient balance?
- Correct permissions?
- Try Smart Wallet

### "Can't Vote"
→ Check:
- Have Advocate? (voting power is active automatically)
- Proposal is Active?
- Haven't voted already?

### "Can't Join Pod"
→ Check:
- Meet eligibility criteria?
- Have required tokens?
- Pod accepting applications?
- Application not already submitted?

### "Can't Create Pod"
→ Check:
- Executive Pod member?
- Wallet connected?
- On Base network?
- All required fields filled?

### "Can't See Module"
→ Check:
- Module deployed?
- Have access permissions?
- Correct pod selected?
- Wait 60s for sync

### "Order Not Showing"
→ Check:
- Wait 60s for sync
- Refresh page
- Transaction confirmed?
- Correct wallet?

### "Can't Add to Cart"
→ Check:
- Meet token requirements?
- Product in stock?
- Size available?
- Wallet connected?

---

## Common Workflows

### First-Time User Onboarding
1. Connect wallet → `01-getting-started.md`
2. Mint Advocate → `01-getting-started.md`
3. Set up identity → `01-getting-started.md`
4. Join first pod → `02-pod-management.md`

### Creating and Voting on Proposal
1. Discuss idea in forum → `06-forum-discussions.md`
2. Gather feedback → `06-forum-discussions.md`
3. Create proposal → `03-governance-voting.md`
4. Share in community → Various
5. Vote on proposal → `03-governance-voting.md`
6. Execute if passed → `03-governance-voting.md`

### Completing a Bounty
1. Browse bounties → `04-bounties-system.md`
2. Check eligibility → `04-bounties-system.md`
3. Submit application → `04-bounties-system.md`
4. Get approved → `04-bounties-system.md`
5. Do the work → `04-bounties-system.md`
6. Submit deliverables → `04-bounties-system.md`
7. Get reviewed → `04-bounties-system.md`
8. Receive payment → `04-bounties-system.md`

### Hosting an Event
1. Create event → `05-events-calendar.md`
2. Promote in community → Various
3. Monitor registrations → `05-events-calendar.md`
4. Host event → `05-events-calendar.md`
5. Check in attendees → `05-events-calendar.md`
6. Mint completion NFTs → `05-events-calendar.md`

### Managing a Pod
1. Create pod → `02-pod-management.md`
2. Add leaders → `02-pod-management.md`
3. Enable modules → `02-pod-management.md`
4. Review applications → `02-pod-management.md`
5. Approve members → `02-pod-management.md`
6. Manage treasury → `02-pod-management.md`

### Shopping in Marketplace
1. Browse products → `07-marketplace-shopping.md`
2. Add to cart → `07-marketplace-shopping.md`
3. Select payment token → `07-marketplace-shopping.md`
4. Checkout → `07-marketplace-shopping.md`
5. Track order → `07-marketplace-shopping.md`

---

## Smart Contract Addresses

**System Contracts:**
- Purchase Router: `NEXT_PUBLIC_PURCHASE_ROUTER`
- Purchase Burn: `NEXT_PUBLIC_PURCHASE_BURN`
- System Token ($SYSTEM): `NEXT_PUBLIC_SYSTEM_TOKEN`
- Self Token ($SELF): `NEXT_PUBLIC_SELF_TOKEN`
- Paymaster: `NEXT_PUBLIC_PAYMASTER`

**Network:**
- Base Chain ID: 8453
- RPC: Base mainnet

---

## API Endpoints

**Authentication:**
- POST `/api/auth/nonce` - Get nonce for SIWE
- POST `/api/auth/verify` - Verify signature
- POST `/api/auth/onchainkit` - OnChainKit auth

**Notifications:**
- POST `/api/notifications` - Create notification
- GET `/api/notifications` - Get user notifications

**Marketplace:**
- GET `/api/products` - Fetch products
- POST `/api/products` - Create product
- GET `/api/orders` - Fetch orders

---

## Database Tables Reference

### Core Tables

**profiles:**
- User identity information
- Linked to wallet address
- Contains basename, bio, avatar

**pods:**
- Pod information
- Leadership structure
- Module configuration

**pod_members:**
- Pod membership records
- Links users to pods
- Tracks roles

**pod_applications:**
- Pending applications
- Approval workflow

**agreement_signatures:**
- Signed agreements
- IPFS CID storage
- Blockchain proof

**proposals:**
- Governance proposals
- On-chain data
- Voting records

**bounties:**
- Bounty postings
- Escrow management
- Status tracking

**bounty_applications:**
- Worker applications
- Approval workflow

**events:**
- Event information
- Registration tracking
- NFT management

**forum_categories:**
- Forum organization
- Access control

**forum_threads:**
- Discussion threads
- Post tracking

**forum_posts:**
- Individual posts
- Reply threading

**marketplace_products:**
- Product listings
- Pricing and inventory

**marketplace_orders:**
- Purchase records
- Fulfillment tracking

**notifications:**
- User notifications
- Event-driven alerts

---

## Help Command Mapping

When users ask for help, direct them to appropriate sections:

**"help" or "how to"** → Getting Started guide
**"pod", "team", "group"** → Pod Management guide
**"vote", "proposal", "governance"** → Governance & Voting guide
**"bounty", "task", "work", "earn"** → Bounties System guide
**"event", "meeting", "calendar"** → Events & Calendar guide
**"forum", "discuss", "post"** → Forum & Discussions guide
**"buy", "shop", "market", "product"** → Marketplace & Shopping guide

---

## Best Practices Summary

### For All Users
- Read relevant guides before attempting actions
- Ensure wallet connected and on Base network
- Have Advocate for core features
- Wait 60 seconds after transactions for sync
- Use Smart Wallet for gasless experience
- Save transaction hashes
- Ask questions in forum if stuck

### For Pod Leaders
- Respond to applications within 48 hours
- Communicate regularly with members
- Keep treasury transparent
- Deploy modules you'll actually use
- Update pod information as needed

### For Contributors
- Read bounty requirements fully
- Submit quality applications
- Communicate proactively
- Deliver on commitments
- Build reputation over time

### For Governance Participants
- Discuss proposals in forum first
- Vote on all active proposals
- Explain your voting rationale
- Respect community decisions
- Contribute constructively

---

## Emergency Contacts

**Technical Issues:**
- Forum: Help category
- Report in Discord
- GitHub Issues: https://github.com/anthropics/claude-code/issues

**Governance Issues:**
- Forum: Governance category
- Contact Executive Pod
- Emergency multi-sig

**Security Concerns:**
- Report immediately to Executive Pod
- Do not share details publicly
- Document evidence

---

**This quick reference is designed for Sensemaker AI to quickly locate information and help users navigate SpiritDAO effectively.**
