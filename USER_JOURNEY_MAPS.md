# User Journey Maps & Key Workflows
**Date**: January 14, 2026
**Purpose**: Map critical user paths for bounty tester validation
**Companion Document**: VIDEO_TUTORIAL_FRAMEWORK.md

---

## Table of Contents

1. [Overview](#overview)
2. [Journey Map Legend](#journey-map-legend)
3. [Core User Journeys](#core-user-journeys)
4. [Critical User Flows](#critical-user-flows)
5. [Testing Validation Points](#testing-validation-points)
6. [User Personas](#user-personas)
7. [Success Metrics](#success-metrics)

---

## Overview

This document maps the **8 primary user journeys** through the CommApp platform. Each journey represents a complete end-to-end workflow that bounty testers should validate during testing cycles.

### Journey Coverage:
- ✅ **5 Essential Journeys** (must work perfectly)
- ✅ **2 Core Journeys** (critical features)
- ✅ **1 Advanced Journey** (power user features)

### Testing Focus:
- 🎯 **Happy Paths**: Expected user behavior
- ⚠️ **Edge Cases**: Boundary conditions and errors
- 🔒 **Security Checks**: Permission and access control
- 💰 **Transaction Flows**: All blockchain operations

---

## Journey Map Legend

### Symbols Used:
- 🟢 **Start Point** - Entry to the journey
- 🔵 **Action** - User performs an action
- 🟡 **Decision** - User makes a choice
- 🟣 **System Process** - Background operation
- 🔴 **End Point** - Journey completion
- ⚠️ **Error State** - Potential failure point
- 🔒 **Auth Gate** - Requires authentication
- 💰 **Transaction** - Blockchain operation (gasless via CDP)
- 📊 **Data Sync** - Database ↔ Blockchain synchronization

### Journey Status:
- ✅ **FULLY MIGRATED** - Uses CDP Embedded Wallets
- 🟡 **PARTIALLY MIGRATED** - Mixed implementation
- ❌ **LEGACY** - Uses old infrastructure

---

## Core User Journeys

---

### Journey 1: First-Time User Onboarding ✅ ESSENTIAL

**User Goal**: Get started on the platform and claim first tokens

**Entry Point**: Landing page (not yet implemented) or `/`

**Journey Steps**:

1. 🟢 **Arrive at platform**
   - User navigates to CommApp URL
   - Sees homepage with "Connect Wallet" button

2. 🔵 **Connect Coinbase Smart Wallet** (VIDEO 1.2)
   - Click "Connect Wallet" in navigation
   - Choose "Coinbase Wallet" option
   - Sign authentication message
   - 🟣 **System**: Creates user_profiles record if first time
   - 🟣 **System**: Initializes evmSmartAccount[0]

3. 🔵 **Create Profile** (VIDEO 1.3)
   - Navigate to `/identity/create`
   - Fill out profile form:
     - First Name + Last Name (required)
     - Bio, interests, seeking (optional)
     - Social links (optional)
   - Click "Create Profile"
   - 🟣 **System**: Saves to user_profiles table

4. 🔵 **Claim Token Faucet** (VIDEO 1.4)
   - Navigate to `/faucet`
   - Click "Claim 100 COMM Tokens"
   - 💰 **Transaction**: CDP UserOperation (gasless!)
     - Uses `useSendUserOperation`
     - Paymaster sponsors gas
     - Mints 100 COMM to Smart Wallet
   - 🟣 **System**: Records claim in database
   - ⚠️ **Error State**: "Already claimed" if duplicate

5. 🔴 **Ready to participate!**
   - User now has:
     - ✅ Smart Wallet connected
     - ✅ Profile created
     - ✅ 100 COMM tokens
     - ✅ Ready to join pods, events, bounties

**Success Criteria**:
- ✅ Wallet connected and persists across sessions
- ✅ Profile displays correctly in ProfileModal
- ✅ 100 COMM tokens show in wallet balance
- ✅ User can navigate to pods/events/bounties

**Testing Validation Points**:
- [ ] Wallet connection works on first try
- [ ] Profile creation saves all fields
- [ ] Faucet claim is gasless (no MetaMask popup)
- [ ] Token balance updates immediately
- [ ] User can access all platform features

**Video Track Coverage**: Track 1 (Videos 1.1-1.4)

---

### Journey 2: Joining and Participating in a Pod ✅ ESSENTIAL

**User Goal**: Find a community, join it, and become an active member

**Entry Point**: `/pods` (Pod Discovery Page)

**Journey Steps**:

1. 🟢 **Browse Available Pods** (VIDEO 2.1)
   - Navigate to `/pods`
   - View pod cards with:
     - Pod name, description, image
     - Member count
     - Pod type (DAO, Community, Project)
   - Click "View Pod Details"

2. 🔵 **View Pod Details** (VIDEO 2.2)
   - Navigate to `/pods/[id]`
   - See detailed information:
     - Full description
     - Current members
     - Required roles (HATs)
     - Treasury balance
     - Active bounties/events
   - Click "Apply to Join"

3. 🟡 **Decision: Application Type**
   - **If Pod Has Application Required**:
     - Fill out application form
     - Provide reason for joining
     - Submit application
     - 🟣 **System**: Creates pod_applications record
     - 🟣 **System**: Notifies pod admins
     - ⚠️ **Wait State**: Pending approval
   - **If Pod Is Open**:
     - Click "Join Pod"
     - 💰 **Transaction**: Assign base member role (gasless)
     - Skip to step 5

4. 🔵 **Admins Approve Application** (VIDEO 2.6)
   - Admin navigates to `/pods/[id]/manage`
   - Clicks "Applications" tab
   - Reviews applicant profile via ProfileModal
   - Clicks "Approve"
   - 💰 **Transaction**: Mint HAT role NFT (gasless)
   - 📊 **Data Sync**: Updates pod_members + blockchain

5. 🔵 **Access Pod Features** (VIDEO 2.3)
   - Navigate to pod page
   - See "Member" badge
   - Access member-only content:
     - Pod forum discussions
     - Internal bounties
     - Treasury proposals
     - Event calendar

6. 🔴 **Active pod member!**
   - User is now:
     - ✅ Listed in pod_members table
     - ✅ Has HAT role NFT in wallet
     - ✅ Can participate in pod governance
     - ✅ Can claim pod bounties

**Success Criteria**:
- ✅ Pod discovery works with accurate data
- ✅ Application process is intuitive
- ✅ HAT role assignment is gasless
- ✅ Member can access all member features
- ✅ ProfileModal shows in admin approval flow

**Testing Validation Points**:
- [ ] Pod cards display accurate member counts
- [ ] Application form submits successfully
- [ ] Admin approval triggers HAT minting
- [ ] HAT NFT appears in user's wallet
- [ ] Member badge shows on pod page
- [ ] Database and blockchain are in sync

**Video Track Coverage**: Track 2 (Videos 2.1-2.3, 2.6)

---

### Journey 3: Registering for and Attending an Event ✅ CORE

**User Goal**: Find an event, register, attend, and earn completion NFT

**Entry Point**: `/events` (Event Discovery Page)

**Journey Steps**:

1. 🟢 **Browse Events** (VIDEO 3.1)
   - Navigate to `/events`
   - View event cards showing:
     - Title, date, location
     - Organizing pod
     - Registration price (COMM tokens)
     - Capacity (e.g., 15/50 registered)
   - Filter by date, pod, type
   - Click "View Event"

2. 🔵 **View Event Details** (VIDEO 3.1)
   - Navigate to `/events/[id]`
   - See full event information:
     - Description
     - Date/time/location
     - Organizer details
     - Registration requirements
     - Current attendees
   - Click "Register for Event"

3. 🟡 **Decision: Event Has Registration Fee?**
   - **If Free Event**:
     - Click "Register (Free)"
     - Skip to step 5
   - **If Paid Event**:
     - See price (e.g., 10 COMM)
     - EventRegistrationModal appears
     - Proceed to step 4

4. 🔵 **Pay Registration Fee** (VIDEO 3.2)
   - EventRegistrationModal shows:
     - Event details
     - Price breakdown
     - User's COMM balance
   - **Token Approval Flow** (if first time):
     - Click "Approve COMM Tokens"
     - 💰 **Transaction 1**: ERC-20 approval (gasless)
     - Approval completes
   - Click "Register & Pay"
   - 💰 **Transaction 2**: Register + transfer COMM (gasless)
   - 📊 **Data Sync**: Updates event_attendees + blockchain

5. 🔵 **Receive Registration Confirmation**
   - 🟣 **System**: Creates event_attendees record
   - 🟣 **System**: Sends confirmation (future: email/notification)
   - User sees "Registered" badge on event page
   - Add to calendar option appears

6. 🔵 **Attend Event** (VIDEO 3.3)
   - User attends event in person/virtually
   - Organizer performs check-in via `/events/manage/[id]/checkin`
   - Organizer scans QR code or manually checks in
   - 💰 **Transaction**: Record attendance on-chain (gasless)
   - 🟣 **System**: Updates event_attendees.checked_in = true

7. 🔵 **Event Completion & NFT Minting** (VIDEO 3.5)
   - Organizer completes event via `/events/manage/[id]`
   - Clicks "Complete Event & Mint Certificates"
   - 🟣 **System**: Batch prepares 100+ attendees
   - 💰 **Transaction**: Batch mint completion NFTs (gasless!)
     - Uses EventManager.batchMintCertificates
     - Mints ERC-721 NFT to each attendee
     - IPFS metadata with event details
   - 🟣 **System**: Updates event status to "completed"

8. 🔴 **NFT Certificate Received!**
   - User receives:
     - ✅ Event completion NFT in wallet
     - ✅ Attendance verified on-chain
     - ✅ Shareable proof of attendance
     - ✅ (Future) Reputation points

**Success Criteria**:
- ✅ Event registration is gasless
- ✅ Token payment flow works smoothly
- ✅ Check-in system records attendance
- ✅ Batch NFT minting completes for all attendees
- ✅ NFTs appear in attendee wallets

**Testing Validation Points**:
- [ ] Event discovery shows accurate capacity
- [ ] Registration modal calculates correct price
- [ ] Token approval is gasless
- [ ] Registration transaction completes
- [ ] Check-in QR code system works
- [ ] Batch minting completes within 30 seconds
- [ ] NFT metadata displays correctly in wallet
- [ ] Database and blockchain sync properly

**Video Track Coverage**: Track 3 (Videos 3.1-3.3, 3.5)

---

### Journey 4: Creating and Managing an Event ✅ CORE

**User Goal**: Create an event as organizer, manage registrations, mint certificates

**Entry Point**: `/events/create` (Event Creation Page)

**Pre-Requisites**:
- 🔒 User must be pod admin/leader
- 🔒 User must have event creation permissions

**Journey Steps**:

1. 🟢 **Start Event Creation** (VIDEO 3.4)
   - Navigate to `/events/create`
   - SimplifiedEventCreationForm appears

2. 🔵 **Fill Event Details**
   - **Required Fields**:
     - Event title
     - Description
     - Date and time
     - Location (physical or virtual)
     - Max capacity
   - **Optional Fields**:
     - Event image URL
     - Registration price (COMM tokens)
     - Registration deadline
     - Organizing pod selection
   - Click "Create Event"

3. 💰 **Deploy Event On-Chain** (VIDEO 3.4)
   - 🟣 **System**: Prepares transaction call
   - Uses `useSimplifiedEventTransactions.getCreateEventCall()`
   - 💰 **Transaction**: Create event via EventManager (gasless)
     - Stores event metadata on-chain
     - Sets up registration system
     - Initializes NFT certificate contract
   - 📊 **Data Sync**: Creates events record in database
   - ⚠️ **Error State**: Transaction failure (retry logic)

4. 🔵 **Event Published**
   - Event appears at `/events/[id]`
   - Listed in `/events` discovery page
   - Organizer receives management link
   - Navigate to `/events/manage/[id]`

5. 🔵 **Manage Registrations** (VIDEO 3.4)
   - View EventManagementDashboard
   - See registered attendees list:
     - Names (via ProfileModal click)
     - Registration timestamps
     - Payment status
   - Monitor capacity (15/50 registered)
   - Download attendee CSV (export feature)

6. 🟡 **Decision: Event Day Actions**
   - **Check-In Attendees**:
     - Navigate to `/events/manage/[id]/checkin`
     - Use EventCheckInSystem
     - Scan QR codes or manual check-in
     - 💰 **Transaction**: Record each check-in (gasless)
   - **Cancel Event** (if needed):
     - Click "Cancel Event"
     - 💰 **Transaction**: Refund all registrations (gasless)
     - 🟣 **System**: Updates event status

7. 🔵 **Complete Event & Mint Certificates** (VIDEO 3.5)
   - After event concludes
   - Click "Complete Event"
   - EventCheckInSystem shows batch mint interface:
     - Lists all checked-in attendees (100+)
     - Generates IPFS metadata for each NFT
     - Prepares batch mint transaction
   - Click "Mint Certificates for All Attendees"
   - 💰 **Transaction**: Batch mint completion NFTs (gasless!)
   - 🟣 **System**: Updates event status to "completed"

8. 🔴 **Event Successfully Managed!**
   - Organizer has:
     - ✅ Created and published event
     - ✅ Managed registrations
     - ✅ Checked in attendees
     - ✅ Minted completion certificates
     - ✅ (Future) Received organizer reputation

**Success Criteria**:
- ✅ Event creation is gasless
- ✅ Registration management is intuitive
- ✅ Check-in system is mobile-friendly
- ✅ Batch NFT minting scales to 100+ attendees
- ✅ All transactions are gas-sponsored

**Testing Validation Points**:
- [ ] Event creation form validates all fields
- [ ] Event deploys on-chain successfully
- [ ] Event appears in discovery within 30 seconds
- [ ] Registration payments flow to correct escrow
- [ ] Check-in QR system works on mobile
- [ ] Batch minting completes for 100+ attendees
- [ ] Event cancellation refunds all payments
- [ ] Database and blockchain remain synced

**Video Track Coverage**: Track 3 (Videos 3.4-3.5)

---

### Journey 5: Finding and Completing a Bounty ✅ ESSENTIAL

**User Goal**: Discover work, bid on bounty, complete tasks, get paid

**Entry Point**: `/bounty` (Bounty Discovery Page)

**Journey Steps**:

1. 🟢 **Browse Available Bounties** (VIDEO 4.1)
   - Navigate to `/bounty`
   - View bounty cards showing:
     - Title and description
     - Reward amount (COMM tokens)
     - Status (Open, In Progress, Completed)
     - Deadline
     - Posting pod
   - Filter by:
     - Status (open, assigned, completed)
     - Pod
     - Reward amount
   - Click "View Bounty"

2. 🔵 **View Bounty Details** (VIDEO 4.2)
   - Navigate to `/bounty/[id]`
   - See full bounty information:
     - Detailed description
     - Deliverables checklist
     - Reward breakdown
     - Estimated time
     - Required skills
     - Funding source (wallet or pod treasury)
   - Review applications from other bidders
   - Click "Bid on Bounty"

3. 🔵 **Submit Bid Application** (VIDEO 4.2)
   - BidApplicationModal appears
   - Fill out bid form:
     - Proposed timeline
     - Why you're qualified
     - Questions for poster
     - Requested reward (if negotiable)
   - Click "Submit Bid"
   - 🟣 **System**: Creates bounty_applications record
   - 🟣 **System**: Notifies bounty poster

4. 🔵 **Bounty Poster Reviews Bids** (VIDEO 4.5)
   - Poster navigates to `/bounty/[id]`
   - Sees all bidder applications
   - Clicks on applicant name → ProfileModal shows
   - Reviews bid proposals
   - Clicks "Assign to [Name]"

5. 💰 **Bounty Assignment Transaction** (VIDEO 4.5)
   - 🟡 **Decision: Funding Source?**
     - **Wallet-Funded**:
       - Uses BountyAssignmentTransaction
       - 💰 **Transaction**: Approve COMM + assign bounty (gasless)
       - Escrows reward in BountyManagerV2
     - **Pod Treasury-Funded**:
       - Uses PodBountyService
       - 🔒 **Auth Check**: User has pod admin HAT role
       - 💰 **Transaction**: Transfer from pod treasury (gasless)
       - Escrows reward in BountyManagerV2
   - 📊 **Data Sync**: Updates bounty_assignments table
   - 🟣 **System**: Notifies assigned worker

6. 🔵 **Worker Completes Bounty** (VIDEO 4.3)
   - Worker performs tasks
   - Submits deliverables via `/bounty/[id]`
   - Uploads proof of work:
     - GitHub PR link
     - Screenshots
     - Documentation
     - IPFS hash (on-chain storage)
   - Clicks "Mark as Complete"
   - 🟣 **System**: Updates bounty status to "pending_review"
   - 🟣 **System**: Notifies bounty poster

7. 🔵 **Bounty Poster Reviews Submission** (VIDEO 4.5)
   - Poster views deliverables
   - 🟡 **Decision: Accept or Request Changes?**
     - **Accept**:
       - Click "Approve & Release Payment"
       - Proceed to step 8
     - **Request Changes**:
       - Provide feedback
       - Worker revises submission
       - Return to step 6

8. 💰 **Payment Release** (VIDEO 4.6)
   - Uses BountyPaymentTransaction
   - 💰 **Transaction**: Release escrowed funds (gasless)
   - COMM tokens transfer from escrow → worker's Smart Wallet
   - 📊 **Data Sync**: Updates bounty status to "completed"
   - 🟣 **System**: Records payment in bounty_payments table

9. 🔴 **Bounty Completed & Paid!**
   - Worker receives:
     - ✅ COMM token payment
     - ✅ Reputation increase
     - ✅ Portfolio piece (on-chain proof of work)
   - Poster receives:
     - ✅ Completed deliverables
     - ✅ (Future) Ability to rate worker

**Success Criteria**:
- ✅ Bounty discovery is accurate
- ✅ Bid submission works smoothly
- ✅ Assignment transaction escrows correctly
- ✅ Payment release is gasless
- ✅ All transactions use CDP infrastructure

**Testing Validation Points**:
- [ ] Bounty cards show accurate reward amounts
- [ ] Bid application submits successfully
- [ ] Assignment escrows funds correctly
- [ ] Worker can upload deliverables
- [ ] Poster can review submissions
- [ ] Payment release transfers correct amount
- [ ] Gasless transactions work for all steps
- [ ] Database and blockchain sync properly
- [ ] IPFS metadata is accessible

**Video Track Coverage**: Track 4 (Videos 4.1-4.3, 4.5-4.6)

---

### Journey 6: Creating and Funding a Bounty ✅ CORE

**User Goal**: Post a bounty, fund it, assign to applicant, release payment

**Entry Point**: `/bounty/create` (Bounty Creation Page)

**Pre-Requisites**:
- 🔒 User has COMM tokens for funding
- 🔒 OR User has pod admin permissions for treasury funding

**Journey Steps**:

1. 🟢 **Start Bounty Creation** (VIDEO 4.4)
   - Navigate to `/bounty/create`
   - BountyFormV2 appears

2. 🔵 **Fill Bounty Details**
   - **Required Fields**:
     - Title
     - Description (markdown supported)
     - Reward amount (COMM tokens)
     - Deadline
   - **Optional Fields**:
     - Deliverables checklist
     - Required skills
     - Estimated time
     - External links (GitHub issue, etc.)
     - Funding source selection (wallet or pod treasury)
   - Click "Create & Fund Bounty"

3. 🟡 **Decision: Funding Source** (VIDEO 4.4)
   - **Wallet Funding**:
     - Uses "EXACT FAUCET PATTERN"
     - 💰 **Transaction 1**: Approve COMM tokens (gasless)
     - 💰 **Transaction 2**: Create bounty + escrow funds (gasless)
     - Funds locked in BountyManagerV2
   - **Pod Treasury Funding**:
     - Select pod from dropdown
     - 🔒 **Auth Check**: Verify pod admin HAT role
     - 💰 **Transaction**: Transfer from pod treasury (gasless)
     - Funds escrowed via PodBountyService

4. 🔵 **Bounty Published**
   - 📊 **Data Sync**: Creates bounty record in database
   - Bounty appears at `/bounty/[id]`
   - Listed in `/bounty` discovery page
   - Status: "Open"
   - Funding status: "Funded"

5. 🔵 **Receive Bid Applications** (VIDEO 4.5)
   - Workers submit bids (see Journey 5, step 3)
   - Poster receives notifications
   - Navigate to `/bounty/[id]`
   - Review applicants via ProfileModal
   - Compare bid proposals

6. 🔵 **Assign Bounty to Worker** (VIDEO 4.5)
   - Click "Assign to [Worker Name]"
   - BountyAssignmentTransaction confirms assignment
   - 📊 **Data Sync**: Updates bounty_assignments
   - 🟣 **System**: Notifies selected worker
   - 🟣 **System**: Notifies rejected applicants
   - Status changes to "In Progress"

7. 🔵 **Monitor Work Progress**
   - View updates from worker
   - Answer questions via comments (future feature)
   - Receive notification when marked complete

8. 🔵 **Review Submission** (VIDEO 4.5)
   - Worker marks bounty complete
   - Poster views deliverables:
     - GitHub links
     - Screenshots
     - Documentation
     - IPFS metadata
   - 🟡 **Decision: Approve or Request Changes?**
     - **Approve**: Proceed to step 9
     - **Request Changes**: Provide feedback, return to step 7

9. 💰 **Release Payment** (VIDEO 4.6)
   - Click "Approve & Release Payment"
   - BountyPaymentTransaction appears
   - 💰 **Transaction**: Release escrowed COMM (gasless)
   - Transfers from BountyManagerV2 → worker's wallet
   - 📊 **Data Sync**: Updates bounty status to "completed"
   - 🟣 **System**: Records in bounty_payments table

10. 🔴 **Bounty Successfully Completed!**
    - Poster receives:
      - ✅ Completed deliverables
      - ✅ (Future) Ability to rate worker
      - ✅ On-chain record of bounty completion
    - Platform benefits:
      - ✅ Escrow system validated
      - ✅ Payment distribution verified
      - ✅ Reputation system updated

**Success Criteria**:
- ✅ Bounty creation is intuitive
- ✅ Funding is gasless (wallet or treasury)
- ✅ Assignment locks escrow correctly
- ✅ Payment release is gasless
- ✅ All transactions use "EXACT FAUCET PATTERN"

**Testing Validation Points**:
- [ ] Bounty form validates all fields
- [ ] Wallet funding escrows correctly
- [ ] Pod treasury funding checks permissions
- [ ] Bounty appears in discovery immediately
- [ ] Assignment transaction completes
- [ ] Escrow holds funds until approval
- [ ] Payment release transfers correct amount
- [ ] Database and blockchain remain synced
- [ ] All transactions are gasless

**Video Track Coverage**: Track 4 (Videos 4.4-4.6)

---

### Journey 7: Participating in Forum and Governance ✅ ADVANCED

**User Goal**: Engage in discussions, create proposals, vote on governance

**Entry Point**: `/forum` (Forum/Proposals Page)

**Journey Steps**:

1. 🟢 **Browse Forum Discussions** (VIDEO 5.1)
   - Navigate to `/forum`
   - See discussion categories:
     - General discussions
     - Governance proposals
     - Feature requests
     - Announcements
   - Filter by pod, topic, recency
   - Click on discussion

2. 🔵 **Participate in Discussion** (VIDEO 5.2)
   - View discussion thread
   - Read existing comments
   - Click "Reply"
   - Write comment (markdown supported)
   - Click "Post Comment"
   - 🟣 **System**: Saves comment to database
   - (No blockchain transaction for comments)

3. 🔵 **Create Governance Proposal** (VIDEO 5.3)
   - Click "Create Proposal"
   - Navigate to `/proposals/create`
   - Fill proposal form:
     - Title
     - Description
     - Proposal type (text, executable)
     - Voting duration
     - Required quorum
   - 🟡 **Decision: Proposal Type?**
     - **Text Proposal**: Social consensus only
     - **Executable Proposal**: On-chain execution (treasury transfer, role changes)

4. 💰 **Submit Proposal On-Chain** (VIDEO 5.3)
   - Click "Submit Proposal"
   - 💰 **Transaction**: Create proposal (gasless)
     - Stores proposal metadata on-chain
     - Initializes voting contract
     - Sets voting period
   - 📊 **Data Sync**: Creates proposals record
   - Proposal appears at `/proposals/[id]`

5. 🔵 **Community Votes on Proposal** (VIDEO 6.1, 6.2)
   - Members navigate to `/proposals/[id]`
   - View proposal details:
     - Full description
     - Current vote tally
     - Time remaining
     - Voting power (based on HAT roles)
   - Click "Vote For" or "Vote Against"
   - 💰 **Transaction**: Submit vote (gasless)
   - 🟣 **System**: Records vote on-chain
   - Vote is immutable and publicly verifiable

6. 🟡 **Decision: Proposal Outcome**
   - **Proposal Passes**:
     - Quorum reached
     - Majority vote achieved
     - Status: "Approved"
     - Proceed to step 7
   - **Proposal Fails**:
     - Quorum not reached or majority against
     - Status: "Rejected"
     - Proposal archived

7. 💰 **Execute Approved Proposal** (VIDEO 6.3)
   - If executable proposal:
     - Admin clicks "Execute Proposal"
     - 💰 **Transaction**: Execute on-chain actions (gasless)
       - Treasury transfers
       - Role assignments
       - Contract upgrades
     - 📊 **Data Sync**: Updates relevant tables
   - If text proposal:
     - Community implements socially
     - No on-chain execution needed

8. 🔴 **Governance Participation Complete!**
   - User has:
     - ✅ Engaged in forum discussions
     - ✅ Created governance proposal
     - ✅ Participated in voting
     - ✅ (If admin) Executed approved proposals
   - Platform benefits:
     - ✅ Transparent governance record
     - ✅ Community-driven decisions
     - ✅ On-chain voting verification

**Success Criteria**:
- ✅ Forum discussions load quickly
- ✅ Proposal creation is intuitive
- ✅ Voting is gasless
- ✅ Proposal execution works for all action types
- ✅ Vote tallies are accurate

**Testing Validation Points**:
- [ ] Forum threads display correctly
- [ ] Comments post successfully
- [ ] Proposal form validates fields
- [ ] Proposal deploys on-chain
- [ ] Voting transaction completes
- [ ] Vote tallies update in real-time
- [ ] Proposal execution triggers correct actions
- [ ] Database and blockchain sync properly

**Video Track Coverage**: Track 5 (Videos 5.1-5.3), Track 6 (Videos 6.1-6.3)

---

### Journey 8: Advanced Treasury Management ✅ ADVANCED

**User Goal**: Manage pod treasury, fund bounties, distribute rewards

**Entry Point**: `/pods/[id]/manage` (Pod Management Dashboard)

**Pre-Requisites**:
- 🔒 User must have pod admin/leader HAT role
- 🔒 Pod must have treasury with COMM tokens

**Journey Steps**:

1. 🟢 **Access Pod Treasury** (VIDEO 7.1)
   - Navigate to `/pods/[id]/manage`
   - Click "Treasury" tab
   - View treasury dashboard:
     - Total balance (COMM tokens)
     - Recent transactions
     - Pending proposals
     - Member contribution history

2. 🔵 **Fund Pod Treasury** (VIDEO 7.1)
   - Click "Deposit to Treasury"
   - Enter COMM token amount
   - 💰 **Transaction**: Transfer to pod treasury (gasless)
   - 📊 **Data Sync**: Updates pod_treasury_transactions
   - Balance updates

3. 🔵 **Create Treasury-Funded Bounty** (VIDEO 4.4)
   - Navigate to `/bounty/create`
   - Fill bounty details (see Journey 6)
   - Select "Fund from Pod Treasury"
   - Choose pod from dropdown
   - 🔒 **Auth Check**: Verify admin HAT role
   - 💰 **Transaction**: Transfer from treasury → escrow (gasless)
   - Bounty funded via PodBountyService

4. 🔵 **Approve Treasury Spending Proposal** (VIDEO 7.1)
   - Member creates spending proposal
   - Admin reviews at `/proposals/[id]`
   - 🟡 **Decision: Approve Spending?**
     - **Approve**:
       - Vote "For" on proposal
       - Wait for quorum
       - Proceed to step 5
     - **Reject**:
       - Vote "Against"
       - Proposal fails

5. 💰 **Execute Treasury Distribution** (VIDEO 6.3)
   - After proposal passes
   - Click "Execute Proposal"
   - 💰 **Transaction**: Transfer from treasury (gasless)
   - Funds distributed to recipient addresses
   - 📊 **Data Sync**: Records in pod_treasury_transactions

6. 🔵 **Monitor Treasury Health** (VIDEO 7.1)
   - View analytics:
     - Burn rate
     - Top spenders
     - Bounty ROI
     - Member contributions
   - Export reports (CSV)

7. 🔴 **Treasury Successfully Managed!**
   - Admin has:
     - ✅ Funded treasury
     - ✅ Created treasury-funded bounties
     - ✅ Approved spending proposals
     - ✅ Executed distributions
     - ✅ Monitored treasury health
   - Pod benefits:
     - ✅ Transparent treasury operations
     - ✅ Community-controlled funds
     - ✅ On-chain audit trail

**Success Criteria**:
- ✅ Treasury deposits are gasless
- ✅ Bounty funding checks permissions
- ✅ Spending proposals execute correctly
- ✅ Analytics display accurate data
- ✅ All transactions use CDP infrastructure

**Testing Validation Points**:
- [ ] Treasury balance displays correctly
- [ ] Deposits update balance immediately
- [ ] Bounty funding checks admin role
- [ ] Spending proposals require quorum
- [ ] Distributions transfer correct amounts
- [ ] Analytics match transaction history
- [ ] CSV export includes all transactions
- [ ] Database and blockchain sync properly

**Video Track Coverage**: Track 7 (Video 7.1), Track 6 (Video 6.3)

---

## Critical User Flows

This section details specific multi-step workflows that are critical to platform functionality.

---

### Critical Flow 1: Gasless Transaction Pattern (CDP Infrastructure)

**Used In**: ALL blockchain operations across the platform

**Pattern Steps**:

1. **User Validation**
   ```typescript
   // EXACT FAUCET PATTERN
   if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
     console.error('❌ Missing wallet or Smart Account');
     return;
   }
   ```

2. **Get Smart Account**
   ```typescript
   const smartAccount = currentUser.evmSmartAccounts[0];
   ```

3. **Prepare Transaction Call**
   ```typescript
   // Example: Bounty creation
   const { getCreateBountyCall } = useBountyTransactions();
   const calls = getCreateBountyCall({
     bountyId,
     reward,
     deadline
   });
   ```

4. **Send UserOperation**
   ```typescript
   const result = await sendUserOperation({
     evmSmartAccount: smartAccount,
     network: 'base',
     calls: calls, // Array of transaction calls
     useCdpPaymaster: true, // ✅ GAS SPONSORSHIP!
   });
   ```

5. **Handle Response**
   ```typescript
   if (result.success) {
     const userOpHash = result.userOperationHash;
     // Sync database with blockchain
     await syncToDatabase(userOpHash);
   }
   ```

**Testing Validation**:
- [ ] No gas fees charged (no MetaMask popup)
- [ ] Transaction completes within 10 seconds
- [ ] UserOperation hash returned
- [ ] Database syncs correctly

---

### Critical Flow 2: HAT Role Assignment & Verification

**Used In**: Pod membership, permissions, access control

**Pattern Steps**:

1. **User Applies to Pod**
   - Submits application via `/pods/[id]`
   - Creates pod_applications record

2. **Admin Approves Application**
   - Views applicant in ApplicationApprovalCard
   - Clicks ProfileModal to review profile
   - Clicks "Approve"

3. **HAT Role Minting Transaction**
   ```typescript
   // ApproveApplicationButton.tsx
   const result = await sendUserOperation({
     evmSmartAccount: smartAccount,
     network: 'base',
     calls: mintHatCall, // Mints ERC-1155 HAT NFT
     useCdpPaymaster: true,
   });
   ```

4. **Blockchain Sync**
   - PodBlockchainSync monitors HatsProtocol events
   - Detects new HAT minting
   - Updates pod_members table
   - Adds role to user_hats table

5. **Permission Verification**
   ```typescript
   // Everywhere permissions are checked
   const { hasRole } = useHatRoles(podId, userAddress);
   const isAdmin = hasRole('admin');
   ```

**Testing Validation**:
- [ ] HAT minting is gasless
- [ ] NFT appears in user's wallet within 30 seconds
- [ ] pod_members table updates
- [ ] Permission checks work immediately
- [ ] ProfileModal displays in approval flow

---

### Critical Flow 3: Token Approval + Transfer (Two-Step Payment)

**Used In**: Event registration, bounty funding, treasury deposits

**Pattern Steps**:

1. **Check Existing Allowance**
   ```typescript
   const { data: allowance } = useReadContract({
     address: COMM_TOKEN_ADDRESS,
     abi: ERC20_ABI,
     functionName: 'allowance',
     args: [userAddress, ESCROW_CONTRACT_ADDRESS],
   });
   ```

2. **If Allowance Insufficient, Request Approval**
   ```typescript
   // TokenApprovalFlow.tsx
   const approveCall = {
     to: COMM_TOKEN_ADDRESS,
     value: 0n,
     data: encodeFunctionData({
       abi: ERC20_ABI,
       functionName: 'approve',
       args: [ESCROW_CONTRACT_ADDRESS, requiredAmount],
     }),
   };

   await sendUserOperation({
     evmSmartAccount: smartAccount,
     network: 'base',
     calls: [approveCall],
     useCdpPaymaster: true, // ✅ APPROVAL IS GASLESS!
   });
   ```

3. **Proceed with Transfer**
   ```typescript
   // After approval completes
   const transferCall = {
     to: ESCROW_CONTRACT_ADDRESS,
     value: 0n,
     data: encodeFunctionData({
       abi: ESCROW_ABI,
       functionName: 'registerForEvent',
       args: [eventId, requiredAmount],
     }),
   };

   await sendUserOperation({
     evmSmartAccount: smartAccount,
     network: 'base',
     calls: [transferCall],
     useCdpPaymaster: true, // ✅ TRANSFER IS GASLESS!
   });
   ```

4. **Database Sync**
   - Updates event_attendees or bounty_assignments
   - Records payment in transactions table

**Testing Validation**:
- [ ] Approval transaction is gasless
- [ ] Transfer transaction is gasless
- [ ] Both transactions complete successfully
- [ ] Escrow receives correct amount
- [ ] Database reflects payment

---

### Critical Flow 4: Batch Operations (Scalability)

**Used In**: Event NFT minting, bulk role assignments

**Pattern Steps**:

1. **Prepare Batch Data**
   ```typescript
   // EventCheckInSystem.tsx
   const recipients = attendees.map(a => a.wallet_address);
   const metadataURIs = await Promise.all(
     attendees.map(a => uploadToIPFS(generateMetadata(a)))
   );
   ```

2. **Generate Batch Calls**
   ```typescript
   const { getBatchMintCertificatesCall } = useSimplifiedEventTransactions();
   const batchCalls = getBatchMintCertificatesCall(
     eventId,
     recipients,    // 100+ addresses
     metadataURIs   // 100+ IPFS hashes
   );
   ```

3. **Send Batch Transaction**
   ```typescript
   await sendUserOperation({
     evmSmartAccount: smartAccount,
     network: 'base',
     calls: batchCalls, // Single transaction, multiple operations
     useCdpPaymaster: true, // ✅ MINTING 100 NFTs = $0 GAS!
   });
   ```

4. **Monitor Progress**
   - Show progress bar during minting
   - Update UI as transaction confirms
   - Verify all NFTs minted successfully

**Testing Validation**:
- [ ] Batch transaction completes for 100+ items
- [ ] Transaction time scales linearly (~30 seconds for 100)
- [ ] All NFTs appear in wallets within 60 seconds
- [ ] No failed mints
- [ ] Database syncs all records

---

### Critical Flow 5: Database ↔ Blockchain Synchronization

**Used In**: All blockchain operations

**Pattern Steps**:

1. **User Initiates Blockchain Action**
   - Example: Create event
   - Transaction sent via CDP

2. **Transaction Confirmation**
   - Wait for UserOperation confirmation
   - Receive userOperationHash

3. **Database Write (Optimistic)**
   ```typescript
   // Immediately after transaction sent
   await supabase.from('events').insert({
     id: eventId,
     title: eventTitle,
     status: 'pending_confirmation',
     blockchain_tx_hash: userOperationHash,
   });
   ```

4. **Blockchain Event Listener**
   ```typescript
   // PodBlockchainSync.tsx
   useEffect(() => {
     const unwatch = publicClient.watchContractEvent({
       address: EVENT_MANAGER_ADDRESS,
       abi: EventManagerABI,
       eventName: 'EventCreated',
       onLogs: async (logs) => {
         // Deduplication check
         const existingEvent = await supabase
           .from('events')
           .select('id')
           .eq('id', logs[0].args.eventId)
           .single();

         if (!existingEvent) {
           // Sync from blockchain
           await syncEventFromChain(logs[0].args);
         } else {
           // Update confirmation status
           await supabase
             .from('events')
             .update({ status: 'confirmed' })
             .eq('id', logs[0].args.eventId);
         }
       },
     });

     return unwatch;
   }, []);
   ```

5. **Conflict Resolution**
   - If database and blockchain mismatch:
     - Blockchain is source of truth
     - Update database to match chain
     - Log discrepancy for review

**Testing Validation**:
- [ ] Database writes happen immediately (optimistic)
- [ ] Blockchain events trigger sync within 30 seconds
- [ ] Deduplication prevents duplicate records
- [ ] Blockchain is always source of truth
- [ ] UI updates reflect confirmed state

---

## Testing Validation Points

This section provides a comprehensive checklist for bounty testers to validate each journey.

---

### Journey 1: Onboarding - Testing Checklist

**Environment Setup**:
- [ ] Use fresh wallet (never connected before)
- [ ] Clear browser cache and cookies
- [ ] Test on Chrome, Firefox, Safari

**Wallet Connection**:
- [ ] Click "Connect Wallet" button visible
- [ ] Coinbase Wallet option appears
- [ ] Connection completes without errors
- [ ] Wallet address displays in navigation
- [ ] Connection persists after page refresh

**Profile Creation**:
- [ ] Navigate to `/identity/create`
- [ ] Form fields validate correctly
- [ ] First name + last name are required
- [ ] Bio, interests, seeking save correctly
- [ ] Social links save with correct URLs
- [ ] Profile image uploads (if implemented)
- [ ] Profile appears at `/identity/[wallet]`

**Token Faucet**:
- [ ] Navigate to `/faucet`
- [ ] Claim button is visible
- [ ] Click "Claim 100 COMM Tokens"
- [ ] NO MetaMask gas popup appears (gasless!)
- [ ] Transaction completes within 10 seconds
- [ ] Balance updates to 100 COMM
- [ ] Second claim shows "Already claimed" error

**Edge Cases**:
- [ ] Disconnect and reconnect wallet (data persists)
- [ ] Try to claim faucet twice (error handling)
- [ ] Leave profile fields empty (validation)
- [ ] Test with slow network connection

---

### Journey 2: Pod Joining - Testing Checklist

**Pod Discovery**:
- [ ] Navigate to `/pods`
- [ ] Pod cards display correctly
- [ ] Member counts are accurate
- [ ] Filter by pod type works
- [ ] Search functionality works (if implemented)

**Pod Application (Closed Pod)**:
- [ ] Click "Apply to Join"
- [ ] Application form appears
- [ ] Submit application successfully
- [ ] Application appears in "My Applications"
- [ ] Admin receives notification (verify as admin)

**Admin Approval Flow**:
- [ ] Admin navigates to `/pods/[id]/manage`
- [ ] Applications tab shows pending applications
- [ ] Click applicant name → ProfileModal opens
- [ ] ProfileModal shows all profile fields:
  - [ ] First name + last name
  - [ ] Interests (if selected)
  - [ ] Seeking (if selected)
  - [ ] Social links (if provided)
  - [ ] Bio
- [ ] Click "Approve"
- [ ] HAT minting transaction is gasless
- [ ] Transaction completes within 15 seconds

**Member Verification**:
- [ ] Approved user sees "Member" badge
- [ ] HAT NFT appears in wallet (check on Base)
- [ ] User listed in pod members list
- [ ] User can access member-only features

**Edge Cases**:
- [ ] Apply to multiple pods simultaneously
- [ ] Admin rejects application (if implemented)
- [ ] Try to access admin pages without permissions
- [ ] Slow blockchain confirmation (sync works)

---

### Journey 3: Event Registration - Testing Checklist

**Event Discovery**:
- [ ] Navigate to `/events`
- [ ] Event cards display correctly
- [ ] Registration capacity shows (15/50)
- [ ] Filter by date works
- [ ] Past events are marked correctly

**Free Event Registration**:
- [ ] Click "Register for Event"
- [ ] Registration completes instantly
- [ ] "Registered" badge appears
- [ ] User listed in attendees

**Paid Event Registration**:
- [ ] Event shows price (e.g., 10 COMM)
- [ ] Click "Register"
- [ ] EventRegistrationModal appears
- [ ] User balance displayed correctly
- [ ] Insufficient balance shows error
- [ ] If sufficient balance:
  - [ ] Token approval is gasless
  - [ ] Registration payment is gasless
  - [ ] Total: 2 transactions, both gasless
  - [ ] Both complete within 20 seconds
  - [ ] Balance decreases by registration price

**Check-In Flow**:
- [ ] Organizer navigates to `/events/manage/[id]/checkin`
- [ ] QR code scanner appears (mobile)
- [ ] Manual check-in works (desktop)
- [ ] Check-in transaction is gasless
- [ ] Attendee marked as checked in

**NFT Minting**:
- [ ] Organizer completes event
- [ ] Batch mint interface shows all attendees
- [ ] Click "Mint Certificates"
- [ ] Progress bar displays during minting
- [ ] Minting 100 NFTs completes within 30 seconds
- [ ] NFTs appear in attendee wallets within 60 seconds
- [ ] Metadata displays correctly (OpenSea, etc.)

**Edge Cases**:
- [ ] Register for full event (capacity error)
- [ ] Register for past event (validation)
- [ ] Cancel registration (if implemented)
- [ ] Check-in without registration (error)

---

### Journey 4: Event Creation - Testing Checklist

**Event Creation Form**:
- [ ] Navigate to `/events/create`
- [ ] Form fields validate correctly
- [ ] Title, description, date are required
- [ ] Max capacity must be positive number
- [ ] Registration price is optional
- [ ] Pod selection works (if admin of multiple)

**Event Deployment**:
- [ ] Click "Create Event"
- [ ] Transaction is gasless
- [ ] Transaction completes within 15 seconds
- [ ] Event appears at `/events/[id]` immediately
- [ ] Event appears in discovery within 30 seconds

**Event Management**:
- [ ] Navigate to `/events/manage/[id]`
- [ ] Registered attendees list displays
- [ ] Click attendee name → ProfileModal opens
- [ ] Capacity counter is accurate
- [ ] Export attendees CSV works (if implemented)

**Event Cancellation**:
- [ ] Click "Cancel Event"
- [ ] Confirmation modal appears
- [ ] Cancellation is gasless
- [ ] All registrations refunded
- [ ] Event marked as "Cancelled"

**Edge Cases**:
- [ ] Create event in the past (validation)
- [ ] Create event with 0 capacity (validation)
- [ ] Complete event without check-ins
- [ ] Mint NFTs for 1 attendee vs 100+

---

### Journey 5: Bounty Completion - Testing Checklist

**Bounty Discovery**:
- [ ] Navigate to `/bounty`
- [ ] Bounty cards display correctly
- [ ] Reward amounts are accurate
- [ ] Filter by status works
- [ ] "Open" bounties are bidable

**Bid Submission**:
- [ ] Click "Bid on Bounty"
- [ ] Bid form appears
- [ ] Submit bid successfully
- [ ] Bid appears in "My Bids"
- [ ] Poster receives notification

**Bounty Assignment**:
- [ ] Poster sees all bids
- [ ] Click bidder name → ProfileModal opens
- [ ] Click "Assign to [Name]"
- [ ] Assignment transaction is gasless
- [ ] Worker receives notification
- [ ] Status changes to "In Progress"

**Work Submission**:
- [ ] Worker uploads deliverables
- [ ] GitHub links work
- [ ] IPFS upload completes (if implemented)
- [ ] Click "Mark as Complete"
- [ ] Status changes to "Pending Review"

**Payment Release**:
- [ ] Poster reviews deliverables
- [ ] Click "Approve & Release Payment"
- [ ] Payment transaction is gasless
- [ ] COMM transfers to worker's wallet
- [ ] Balance updates correctly
- [ ] Status changes to "Completed"

**Edge Cases**:
- [ ] Bid on already assigned bounty (error)
- [ ] Submit deliverables before assignment (error)
- [ ] Release payment without approval (permission check)
- [ ] Worker wallet different from bid wallet

---

### Journey 6: Bounty Creation - Testing Checklist

**Bounty Form**:
- [ ] Navigate to `/bounty/create`
- [ ] Form validates all required fields
- [ ] Reward amount must be positive
- [ ] Deadline must be future date
- [ ] Markdown preview works (if implemented)

**Wallet Funding**:
- [ ] Select "Fund from Wallet"
- [ ] Insufficient balance shows error
- [ ] If sufficient balance:
  - [ ] Token approval is gasless
  - [ ] Bounty creation + escrow is gasless
  - [ ] Balance decreases by reward amount
  - [ ] Funds locked in BountyManagerV2

**Pod Treasury Funding**:
- [ ] Select "Fund from Pod Treasury"
- [ ] Only shows pods where user is admin
- [ ] Non-admin sees error
- [ ] If admin:
  - [ ] Transaction is gasless
  - [ ] Pod treasury balance decreases
  - [ ] Funds escrowed via PodBountyService

**Bounty Management**:
- [ ] Bounty appears in discovery immediately
- [ ] Receive bid notifications
- [ ] Assign to applicant (see Journey 5)
- [ ] Review submissions
- [ ] Release payment

**Edge Cases**:
- [ ] Create bounty with 0 reward (validation)
- [ ] Fund from empty treasury (error)
- [ ] Try to fund from non-admin pod (permission check)
- [ ] Cancel bounty before assignment (if implemented)

---

### Journey 7: Forum & Governance - Testing Checklist

**Forum Discussions**:
- [ ] Navigate to `/forum`
- [ ] Threads display correctly
- [ ] Create new discussion works
- [ ] Reply to thread works
- [ ] Markdown formatting renders

**Proposal Creation**:
- [ ] Click "Create Proposal"
- [ ] Proposal form validates
- [ ] Choose text or executable type
- [ ] Deployment is gasless
- [ ] Proposal appears at `/proposals/[id]`

**Voting**:
- [ ] Navigate to proposal
- [ ] Vote "For" or "Against"
- [ ] Voting is gasless
- [ ] Vote tallies update in real-time
- [ ] Cannot vote twice (error)
- [ ] Voting power based on HAT roles

**Proposal Execution**:
- [ ] Proposal passes quorum
- [ ] Status changes to "Approved"
- [ ] If executable:
  - [ ] Admin can click "Execute"
  - [ ] Execution is gasless
  - [ ] Actions trigger correctly (treasury transfer, etc.)

**Edge Cases**:
- [ ] Vote without HAT role (permission check)
- [ ] Execute proposal without quorum (validation)
- [ ] Create duplicate proposals
- [ ] Vote after deadline (error)

---

### Journey 8: Treasury Management - Testing Checklist

**Treasury Access**:
- [ ] Navigate to `/pods/[id]/manage`
- [ ] Non-admins cannot access (permission check)
- [ ] Admins see "Treasury" tab
- [ ] Balance displays correctly

**Treasury Deposit**:
- [ ] Click "Deposit to Treasury"
- [ ] Enter amount
- [ ] Transaction is gasless
- [ ] Treasury balance increases
- [ ] User balance decreases

**Treasury-Funded Bounty**:
- [ ] Create bounty (see Journey 6)
- [ ] Select pod treasury as funding source
- [ ] Transaction is gasless
- [ ] Treasury balance decreases
- [ ] Bounty funded correctly

**Spending Proposals**:
- [ ] Create spending proposal
- [ ] Community votes (see Journey 7)
- [ ] Proposal passes
- [ ] Execute distribution
- [ ] Funds transfer to recipients

**Analytics**:
- [ ] Treasury transactions list is accurate
- [ ] CSV export works
- [ ] Balance history displays correctly

**Edge Cases**:
- [ ] Deposit more than wallet balance (error)
- [ ] Fund bounty with insufficient treasury (error)
- [ ] Execute proposal without quorum (validation)
- [ ] Concurrent treasury operations (race conditions)

---

## User Personas

Understanding who will use the platform helps design better user journeys.

---

### Persona 1: Sarah - The Newcomer 🌱

**Background**:
- 25 years old, marketing professional
- No blockchain experience
- Heard about CommApp from Twitter
- Wants to earn extra income doing bounties

**Goals**:
- Learn how to use the platform
- Complete first bounty
- Join a pod community
- Earn COMM tokens

**Pain Points**:
- Intimidated by Web3 terminology
- Doesn't want to pay gas fees
- Needs clear instructions
- Wants fast onboarding

**Journey Focus**:
- Journey 1: Onboarding (critical!)
- Journey 5: Bounty completion
- Journey 2: Pod joining

**Video Track**: Track 1 (Getting Started) is ESSENTIAL

---

### Persona 2: Marcus - The Builder 🔨

**Background**:
- 30 years old, full-stack developer
- Some Web3 experience (used Uniswap, OpenSea)
- Looking for freelance work
- Interested in DAO governance

**Goals**:
- Find high-value bounties
- Build reputation on-chain
- Participate in governance
- Eventually create own bounties

**Pain Points**:
- Needs efficient workflow
- Wants transparent payment system
- Seeks reputation building
- Values community feedback

**Journey Focus**:
- Journey 5: Bounty completion (primary)
- Journey 6: Bounty creation (secondary)
- Journey 7: Governance participation

**Video Track**: Track 4 (Bounties) + Track 6 (Governance)

---

### Persona 3: Lisa - The Community Organizer 🎉

**Background**:
- 28 years old, event coordinator
- Runs local tech meetups
- Moderate blockchain knowledge
- Wants to tokenize attendance

**Goals**:
- Create and manage events
- Issue NFT certificates
- Build engaged community
- Track attendance on-chain

**Pain Points**:
- Needs scalable check-in system
- Wants gasless operations for attendees
- Requires batch NFT minting
- Values attendee data privacy

**Journey Focus**:
- Journey 4: Event creation (primary)
- Journey 3: Event registration (test as attendee)
- Journey 2: Pod creation (for her community)

**Video Track**: Track 3 (Events) + Track 2 (Pods)

---

### Persona 4: David - The DAO Leader 👑

**Background**:
- 35 years old, project manager
- Deep Web3 experience (DAOs, DeFi)
- Manages pod with 50+ members
- Controls $10k+ treasury

**Goals**:
- Manage pod treasury efficiently
- Fund bounties from treasury
- Govern through proposals
- Scale community operations

**Pain Points**:
- Needs permission management
- Wants transparent treasury operations
- Requires governance tooling
- Values on-chain accountability

**Journey Focus**:
- Journey 8: Treasury management (primary)
- Journey 6: Bounty creation (treasury-funded)
- Journey 7: Governance (proposal execution)
- Journey 2: Pod management (admin side)

**Video Track**: Track 7 (Advanced) + Track 6 (Governance)

---

### Persona 5: Alex - The Bounty Tester 🧪

**Background**:
- 22 years old, CS student
- Early platform adopter
- Technical background
- Helps find bugs

**Goals**:
- Test all platform features
- Find edge cases and bugs
- Validate gasless transactions
- Ensure smooth UX

**Pain Points**:
- Needs comprehensive testing guide
- Wants clear success criteria
- Requires reproducible test scenarios
- Values detailed documentation

**Journey Focus**:
- ALL journeys (comprehensive testing)
- Focus on edge cases
- Validate transaction flows
- Test cross-feature interactions

**Video Track**: All tracks (1-7) to understand full platform

---

## Success Metrics

How to measure if user journeys are successful.

---

### Onboarding Success (Journey 1)

**Metrics**:
- **Completion Rate**: 80%+ of users complete full onboarding
- **Time to First Token**: <5 minutes from landing to faucet claim
- **Wallet Connection Success**: 95%+ connect on first try
- **Profile Creation Rate**: 70%+ create profiles after wallet connection

**Red Flags**:
- 🚩 Wallet connection fails >10% of time
- 🚩 Faucet claim errors >5%
- 🚩 Users drop off before profile creation

---

### Pod Joining Success (Journey 2)

**Metrics**:
- **Application Approval Time**: <24 hours median
- **HAT Minting Success**: 99%+ transactions complete
- **ProfileModal Usage**: Admins view profiles before approving 80%+ times
- **Member Retention**: 60%+ members active after 7 days

**Red Flags**:
- 🚩 HAT minting fails >1%
- 🚩 Admins skip profile review (potential quality issues)
- 🚩 Members inactive after joining (onboarding failure)

---

### Event Success (Journeys 3 & 4)

**Metrics**:
- **Registration Completion**: 90%+ registrations complete successfully
- **Payment Transaction Success**: 95%+ paid registrations complete
- **Check-In Rate**: 70%+ registered users check in
- **NFT Minting Success**: 99%+ batch mints complete
- **NFT Delivery Time**: <60 seconds to appear in wallets

**Red Flags**:
- 🚩 Registration payments fail >5%
- 🚩 Batch minting fails for any attendee
- 🚩 NFTs don't appear within 2 minutes
- 🚩 Check-in system has errors

---

### Bounty Success (Journeys 5 & 6)

**Metrics**:
- **Bounty Funding Success**: 98%+ bounties fund correctly
- **Assignment Transaction Success**: 99%+ assignments complete
- **Payment Release Success**: 99%+ payments complete
- **Completion Rate**: 60%+ assigned bounties are completed
- **Time to Payment**: <5 minutes from approval to wallet

**Red Flags**:
- 🚩 Escrow fails to lock funds
- 🚩 Payment release fails >1%
- 🚩 Database and blockchain desync
- 🚩 Low bounty completion rate (<40%)

---

### Governance Success (Journey 7)

**Metrics**:
- **Proposal Creation Success**: 95%+ proposals deploy on-chain
- **Voting Participation**: 30%+ eligible voters participate
- **Vote Transaction Success**: 99%+ votes complete
- **Execution Success**: 100% approved proposals execute correctly

**Red Flags**:
- 🚩 Proposal deployment fails >5%
- 🚩 Voting transactions fail
- 🚩 Low participation (<15%)
- 🚩 Execution fails for approved proposals

---

### Treasury Success (Journey 8)

**Metrics**:
- **Deposit Success**: 99%+ deposits complete
- **Treasury-Funded Bounty Success**: 95%+ bounties fund from treasury
- **Permission Checks**: 100% non-admins blocked
- **Transaction Accuracy**: 100% amounts match intent

**Red Flags**:
- 🚩 Unauthorized access to treasury
- 🚩 Incorrect amounts transferred
- 🚩 Database desync with blockchain
- 🚩 Treasury balance discrepancies

---

### Overall Platform Health

**Metrics**:
- **Transaction Success Rate**: 98%+ across all operations
- **Gasless Transaction Rate**: 100% (all via CDP Paymaster)
- **Database Sync Success**: 99%+ operations sync correctly
- **Average Transaction Time**: <15 seconds
- **User Retention**: 50%+ users return within 7 days

**Red Flags**:
- 🚩 Any gas fees charged to users
- 🚩 Transaction failures spike
- 🚩 Database desyncs increase
- 🚩 Transaction times >30 seconds
- 🚩 High user drop-off

---

## Appendix: Journey Dependency Map

```
Journey 1 (Onboarding)
  ↓
  ├─→ Journey 2 (Pod Joining) → Journey 8 (Treasury Management)
  ├─→ Journey 3 (Event Registration) → Journey 4 (Event Creation)
  ├─→ Journey 5 (Bounty Completion) → Journey 6 (Bounty Creation)
  └─→ Journey 7 (Governance)
```

**Legend**:
- Journey 1 is a prerequisite for ALL other journeys
- Arrows show logical progression
- Users may complete journeys in any order after onboarding

---

## Appendix: Video Tutorial Mapping

Each journey maps to specific video tutorials from `VIDEO_TUTORIAL_FRAMEWORK.md`:

| Journey | Video Track | Key Videos |
|---------|-------------|------------|
| Journey 1: Onboarding | Track 1 | 1.1-1.4 |
| Journey 2: Pod Joining | Track 2 | 2.1-2.3, 2.6 |
| Journey 3: Event Registration | Track 3 | 3.1-3.3, 3.5 |
| Journey 4: Event Creation | Track 3 | 3.4-3.5 |
| Journey 5: Bounty Completion | Track 4 | 4.1-4.3, 4.5-4.6 |
| Journey 6: Bounty Creation | Track 4 | 4.4-4.6 |
| Journey 7: Governance | Track 5, 6 | 5.1-5.3, 6.1-6.3 |
| Journey 8: Treasury Management | Track 7 | 7.1, 6.3 |

---

**End of User Journey Maps Document**

---

## Next Steps for Testing Team

1. **Review User Journeys**: Ensure all 8 journeys align with platform capabilities
2. **Create Test Scenarios**: Develop specific test cases for each validation point
3. **Record Video Walkthroughs**: Follow journeys to create tutorial content
4. **Document Edge Cases**: Note all errors and edge cases discovered
5. **Build Test Data**: Create sample pods, events, bounties for reproducible testing
6. **Establish Testing Cadence**: Weekly testing cycles with journey rotation

---

**Document Author**: Claude Code
**Date**: January 14, 2026
**Version**: 1.0
**Status**: Ready for Bounty Tester Review
