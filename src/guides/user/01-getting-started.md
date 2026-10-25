# Getting Started with SpiritDAO

## What is SpiritDAO?

SpiritDAO is federated infrastructure for self-sovereign communities: a 501(c)(3) nonprofit that lets communities own their data, governance, and treasury. Built on Base (Ethereum Layer 2), it allows communities to organize into "Pods" (working groups) with transparent governance, bounty systems, and event coordination. SpiritDAO is open to new communities and members, so you can join a community or organize your own.

## Core Concepts

**Pod**: A working group or team within the DAO with its own members, leadership, and permissions
**Hat**: A role token that grants specific permissions (powered by Hats Protocol)
**Governance**: On-chain voting system for community decisions
**Bounties**: Task-based rewards system for contributors
**Events**: Community gatherings with NFT-based registration

---

## First Time Setup

SpiritDAO is open enrollment: download the app, connect with a community, or organize your own. There is no invitation gate.

### Step 1: Connect Your Wallet

![The sign-in screen: email code or Google, no wallet app needed.](https://app.spiritdao.org/images/docs/getting-started/01-sign-in.png)

1. Click "Connect Wallet" button in top right
2. Choose wallet option:
   - **Smart Wallet** (Recommended): No gas fees, easier to use
   - **Coinbase Wallet**: Direct connection
   - **WalletConnect**: Other wallets
3. Approve connection in your wallet
4. Your address appears in top right when connected

**What you need:**
- A wallet with some ETH on Base network
- Or use Smart Wallet for gasless transactions

**Embedded wallet:** The built-in embedded wallet gives you added security and lets you get started without external tools. You can link multiple devices to your account; a polished settings screen for managing linked devices is on the way.

### Step 2: Set Up Your Identity

1. Go to **Identity** page (profile icon)
2. Click "Edit Profile"
3. Fill in:
   - First Name
   - Last Name
   - Profile Picture (optional)
   - Bio (optional)
   - Interests (select from chips)
   - What you're seeking (select from chips)
   - Openness to Connect (Low/Limited, Open/Available, or Actively Collaborating)
4. Click "Save Changes"

**Openness to Connect:** This setting controls the availability badge on your profile and how you sort in the Members directory (actively-collaborating members appear first). It does not restrict who can message you; any member can still send you a Direct Message regardless of the setting.

**Contacting members:** Members reach each other through in-app Direct Messages. To contact someone, open their profile and use the Message button. Your email address stays private (it is used for your own login and notifications, not shown to other members or used for member-to-member contact).

**Location (optional):** Further down the Identity page, **Location** lets you choose to appear on your pods' shared maps. It is off unless you turn it on, stored approximately (about 1 km) by default, visible only to people who share a pod with you, and removable any time. See [Journal and Places](19-journal-and-places.md).

**Why this matters:**
- Other members can find you
- Builds trust in community
- Required for some pod applications

![Identity → Edit Profile: name, picture, bio, interests, and openness to connect.](https://app.spiritdao.org/images/docs/getting-started/02-edit-profile.png)

### Step 3: Get Advocate (Optional)

Advocate is a DAO-wide membership accreditation. It appears under **Accreditations** on your identity page.

**Benefits:**
- Create governance proposals
- Vote on DAO-wide decisions
- Access exclusive features

**How to get:**
1. Go to **Mint** page
2. Click "Mint Advocate"
3. Approve transaction (gasless if using Smart Wallet)
4. Advocate appears in your wallet

**Voting is active immediately.** Advocate is auto-delegated when it is minted, so your voting power is live right away. There is no manual "delegate to yourself" step.

---

![Credentials and accreditations on the Identity page, Advocate included.](https://app.spiritdao.org/images/docs/getting-started/05-credentials-gallery.png)

## Understanding Permissions

SpiritDAO uses role-based permissions:

**Executive Pod Member**: Can create new pods, manage DAO-wide settings
**Pod Leader**: Can manage their pod, approve applications, deploy modules
**Pod Member**: Can participate in pod activities, see pod content
**Advocate**: Can vote on governance proposals

**Permission Check:**
- Top right shows your current role
- Locked features show "No Permission" message
- Apply to pods to gain more access

---

## Navigation

![The home screen: your modules on top, community modules below.](https://app.spiritdao.org/images/docs/getting-started/03-home-screen.png)

### Top Bar
- **SpiritDAO Logo**: Return to home
- **Search**: Find pods, events, proposals
- **Notifications Bell**: See recent activity
- **Profile Menu**: Access identity, settings, logout

### Bottom Mobile Nav
- **Home**: Overview dashboard
- **Pods**: Browse and manage pods
- **Events**: Community calendar
- **Forum**: Discussions
- **Bounties**: Task marketplace

---

![The bottom bar: Home, Claims, Govern, Alerts.](https://app.spiritdao.org/images/docs/getting-started/04-bottom-nav.png)

## Key Features Overview

### Pods (Working Groups)
- Create or join specialized teams
- Each pod has unique permissions
- Enable/disable modules (Forum, Events, Bounties, Treasury)

### Governance
- Create proposals (requires Advocate)
- Vote on-chain (active immediately after minting Advocate)
- Track proposal status

### Bounties
- Post tasks with rewards
- Apply to complete bounties
- Submit work for review
- Get paid in crypto

### Events
- Create community events
- Register with NFT
- Check-in at events
- Earn completion NFTs

### Forum
- Start discussion threads
- Post replies
- Pod-specific or public forums
- Markdown support

### Marketplace (Artifacts)
- Buy/sell community artifacts with $SYSTEM, or burn $SELF to pay
- $SYSTEM can route to a creator wallet or pod treasury; $SELF is always burned (it can't be transferred)
- Shopping cart system
- Gasless checkout option

### Video Chat & Conferencing
- Real-time video calls between pod members
- Multi-participant conference rooms for meetings and governance calls
- Integrated with pod membership (access governed by your roles)

### Knowledge Base
- Video tutorials for every platform feature
- Step-by-step written guides
- Guided tour to walk through the full app in ~2 minutes
- **Courses.** A pod can mark a knowledge category as a course. Complete every item in it and the pod issues you an accreditation. It appears under Accreditations on your Identity page, and pods can require it for bounties and, later, for roles. A course category shows your progress ("2/4") in the category list; pick it to see the accreditation it leads to.

---

## Common Actions

### Join a Pod
1. Go to **Pods** page
2. Browse available pods
3. Click pod to view details
4. Click "Apply for Membership"
5. Fill application form
6. Submit and wait for approval

### Vote on Proposal
1. Go to **Vote** or **Governance** page
2. Click on active proposal
3. Read proposal details
4. Click "Vote"
5. Select For/Against/Abstain
6. Confirm transaction

### Apply for Bounty
1. Go to **Bounty** page
2. Browse open bounties
3. Click bounty to view details
4. Click "Apply for Bounty"
5. Submit your application
6. Wait for approval

### Register for Event
1. Go to **Events** or **Calendar** page
2. Find upcoming event
3. Click "Register Now"
4. Approve transaction (may require payment)
5. Receive registration NFT

---

## Troubleshooting

### "Transaction Failed" Error
- **Check balance**: Ensure you have enough ETH
- **Switch network**: Must be on Base network
- **Try Smart Wallet**: Use gasless transactions
- **Refresh page**: Sometimes state gets out of sync

### "No Permission" Message
- **Check role**: May need specific Hat role
- **Apply to pod**: Join relevant pod first
- **Mint Advocate**: Some features require Advocate
- **Ask leader**: Pod leaders can grant access

### "Wallet Not Connected"
- **Reconnect**: Click Connect Wallet again
- **Clear cache**: Try incognito/private mode
- **Different wallet**: Try alternative wallet option

### Can't See My Pod
- **Refresh**: Pull down to refresh on mobile
- **Check filters**: Remove any active filters
- **Sync delay**: Wait 30 seconds for blockchain sync

---

## Best Practices

### Security
- Never share private keys
- Verify transaction details before signing
- Use hardware wallet for large amounts
- Enable 2FA on Coinbase Wallet

### Community
- Fill out complete profile
- Be respectful in forums
- Follow pod guidelines
- Honor agreements you sign

### Governance
- Read full proposals before voting
- Participate in discussions
- Vote before deadline

---

## Getting Help

### Guided Tour
1. Go to **Knowledge Base** page
2. Click the "Take a guided tour" card (🧭) at the top
3. Walk through every section in ~2 minutes

![The guided tour highlights each module in turn.](https://app.spiritdao.org/images/docs/getting-started/06-guided-tour.png)

### Knowledge Base Videos
1. Go to **Knowledge Base** from the home screen
2. Browse categories for step-by-step video guides
3. Available for every major feature

### In-App AI Assistant
1. Click **Sensemaker AI** icon
2. Ask about the platform or Temporal Naturalism philosophy
3. Get instant, contextual help

### Community Support
- **Forum**: Post in Help category
- **Chat**: Ask in pod chat channels
- **Leaders**: Message pod leaders directly

### Technical Issues
- Check notification for error messages
- Try different wallet/browser
- Clear cache and reconnect
- Report bugs in forum

---

## Next Steps

On your first visit, the home screen asks **What brings you here?** (join a community, found one, or just explore) and gives you a short checklist for that path. See [App Walkthrough](09-app-walkthrough.md) for how it works. The general order is:

1. ✅ Set up your identity profile
2. ✅ Join your first pod
3. ✅ Participate in forum discussion
4. ✅ Vote on a proposal (if you have Advocate)
5. ✅ Apply for a bounty
6. ✅ Register for an event

**Welcome to SpiritDAO! 🌿**
