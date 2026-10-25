# Pod Management Guide

## What are Pods?

Pods are working groups or teams within Spirit DAO. Each pod has:
- **Unique purpose**: Specific mission or focus area
- **Members**: Contributors with membership Hat tokens
- **Leaders**: Manage pod and approve members
- **Modules**: Optional features (Forum, Events, Bounties, Treasury, and more)
- **Permissions**: Control who can access what

Pods can be **time-restricted or eternal**: some are created for a fixed span, and others run indefinitely.

---

## Pod Roles

### Executive Pod Member
- Can create new pods
- Highest level of DAO access
- Manages DAO-wide settings
- Approves other pods

### Pod Leader
- Manages their specific pod
- Approves/rejects member applications
- Can remove members
- Deploys pod modules
- Signs agreements on behalf of pod

### Pod Member
- Participates in pod activities
- Can post in pod forum
- Can register for pod events
- Can apply for pod bounties
- Must follow pod agreements

---

## Finding & Joining Pods

### Browse Pods
1. Go to **Pods** page
2. View all active pods
3. See pod details:
   - Name and description
   - Member count
   - Active modules
   - Application status

![The Pods directory.](https://app.spiritdao.org/images/docs/pods/01-pods-directory.png)

### View Pod Details
1. Click on any pod card
2. See full information:
   - Description and mission
   - Current members with profiles
   - Leadership structure
   - Active modules (Forum, Events, Bounties)
   - Membership requirements

![A pod page: name, status, description, funding, and the sections below.](https://app.spiritdao.org/images/docs/pods/02-pod-page.png)

### Apply for Membership
1. On pod details page, click "Apply for Membership"
2. Review membership agreement (if exists)
3. Fill out application form:
   - Why you want to join
   - Relevant skills/experience
   - Expected contribution
4. Sign agreement (blockchain transaction)
5. Submit application
6. Wait for leader approval

**Application Status:**
- **Pending**: Submitted, awaiting review
- **Approved**: Accepted, Hat token will be created
- **Rejected**: Not accepted, can reapply

![Applying to a pod: pick a role, answer the prompts, sign.](https://app.spiritdao.org/images/docs/pods/03-apply-for-membership.png)

### After Approval
1. Leader approves your application
2. Your membership Hat is automatically created
3. You receive notification
4. Hat appears in your identity
5. You can now access pod features

---

## Creating a Pod

**Required:** Must be Executive Pod member

### Step 1: Navigate to Create Pod
1. Go to **Pods** page
2. Click "Create Pod" button (only visible if you have permission)
3. Choose creation method:
   - **Create with Modules** (Recommended): Full featured pod
   - **Simple Creation**: Basic pod without modules

### Step 2: Fill Basic Information
**Pod Name:**
- Clear, descriptive name
- Will appear in all pod listings

**Description:**
- Explain pod's mission and purpose
- What the pod does
- Who should join

**Image:**
- Upload pod logo or image
- Represents pod visually
- Optional but recommended

**Parent Pod:**
- Select parent pod (usually "Executive Pod")
- Creates hierarchical structure
- Inherits some permissions

![Create a pod: name, description, image.](https://app.spiritdao.org/images/docs/pods/04-create-pod-basics.png)

### Step 3: Add Pod Leaders
**Minimum:** 2 leaders required (for accountability)

1. Search for members by name or address
2. Click to add as leader
3. Each leader must sign accountability agreement
4. Agreement includes:
   - Acting with integrity
   - Personal liability
   - Compliance with rules
   - No misappropriation of funds

**Important:** Leaders have significant power and responsibility

![Add leaders by wallet or by member search.](https://app.spiritdao.org/images/docs/pods/05-create-pod-leaders.png)

### Step 4: Set Eligibility Criteria (Optional)
Control who can join:

**Token Balance:**
- Require specific token
- Minimum balance amount
- Example: "Must hold 5 USDC"

**NFT Ownership:**
- Require specific NFT
- Example: "Must hold Advocate"

**Other Pod Membership:**
- Must be member of another pod first
- Example: "Must be in Contributor Pod"

![Eligibility: token holdings, agreements, or other-pod membership.](https://app.spiritdao.org/images/docs/pods/06-create-pod-eligibility.png)

### Step 5: Enable Modules (Optional)
**Available Modules:**

Pod modules come in three kinds:
- **Core** (included): Chat, Forum, Treasury, Governance, Events, Bounties, Marketplace, Knowledge Base, Sub-Pods

**Courses and accreditations.** In the Knowledge Base manager, tick *This category is a course* when creating a category (or use *Make this a course* on an existing one) and give the accreditation a name, for example "TN Basics Graduate". Add the items in order. When a member has completed every item, the accreditation is issued to them automatically; the category card shows how many members hold it. Accreditations appear on the member's Identity page and can be required by bounties ("Holders of specific credentials → Course accreditations"). Turning a course off stops new issues but keeps the ones already earned; a leader can revoke an individual accreditation if needed.
- **Add-ons**: Surveys, Password Vault, Custom Appearance (see the [Pod Faces guide](18-pod-faces.md)), Places — a members-only shared map of your community's land, partners, sites and ideas (see the [Journal and Places guide](19-journal-and-places.md))
- **Paid**: Community AI Agent (a monthly $SYSTEM subscription)

**Forum Module:**
- Pod-specific discussion board
- Create threads and posts
- Pod members only

**Events Module:**
- Pod-specific events
- Event registration
- Attendance tracking

**Bounty Module:**
- Pod-specific task marketplace
- Funded from pod treasury
- Restricted to pod members

**Treasury Module:**
- Multi-sig treasury
- Hold pod funds
- Transparent accounting

![Choose the modules your pod starts with.](https://app.spiritdao.org/images/docs/pods/07-create-pod-modules.png)

### Step 6: Review and Create
1. Review all information
2. Confirm accountability agreement
3. Click "Create Pod"
4. Sign blockchain transaction
5. Wait for confirmation
6. Pod appears in listings

**Note:** Pod creation may take 30-60 seconds to sync

---

![Review, then create. The on-chain step is gasless.](https://app.spiritdao.org/images/docs/pods/08-create-pod-review.png)

## Managing Your Pod

### Access Pod Management
1. Go to **Pods** page
2. Click on your pod
3. Click "Manage Pod" button (only visible to leaders)

### Pod Management Dashboard

![Manage: the tab strip across the top of pod management.](https://app.spiritdao.org/images/docs/pods/09-manage-tabs.png)

#### Members Tab
**View All Members:**
- See list of current members
- View member profiles
- See member roles (Leader vs Member)

**Add Member Manually:**
1. Click "Add Member"
2. Search by name or address
3. Select member
4. Choose role (Member or Leader)
5. Member receives notification
6. Hat is automatically created

**Remove Member:**
1. Click "Remove" next to member name
2. Confirm removal
3. Member's Hat is deactivated
4. Member loses pod access
5. Removal is immediate

**Important:** Removed members can reapply

#### Applications Tab
**Review Pending Applications:**
1. See all pending applications
2. Click on application to view details
3. Read applicant's responses
4. View applicant's profile

**Approve Application:**
1. Click "Approve"
2. Confirm decision
3. System automatically creates Hat token
4. Applicant receives notification
5. Applicant can now access pod

**Reject Application:**
1. Click "Reject"
2. Optionally add reason
3. Applicant receives notification
4. Application moves to rejected status

**Vote on Application (if configured):**
1. Click "Vote"
2. Select Approve/Reject
3. All leaders must vote
4. Requires majority approval
5. Automatic execution after voting ends

#### Modules Tab
**View Active Modules:**
- See which modules are enabled
- Check module status
- View module settings

**Deploy New Module:**
1. Click "Deploy Module"
2. Select module type (Forum, Events, Bounties, Treasury)
3. Configure module settings
4. Sign transaction
5. Wait for deployment (30-60 seconds)

**Module Configuration:**
- Each module has specific settings
- Can toggle public vs. pod-only access
- Can set permissions per module

#### Treasury Tab (if enabled)
**View Treasury Balance:**
- See all token balances
- View transaction history
- Check multi-sig settings

**Multisig Transactions:**
- Requires multiple leader signatures
- Prevents single point of failure
- Transparent and on-chain

**Fund Treasury:**
1. Click "Fund Treasury"
2. Select token and amount
3. Approve transaction
4. Funds appear in treasury balance

#### Settings Tab
**Edit Pod Information:**
- Update description
- Change image
- Modify settings

**Manage Agreements:**
- View signed agreements
- Update membership agreement
- Add new agreements

**Danger Zone:**
- Delete pod (requires all leader approval)
- Transfer leadership
- Disable pod

---

## Pod Agreements

### What are Agreements?
- Legal-style documents members must sign
- Stored on IPFS (permanent, decentralized)
- Signed on blockchain
- Enforces expectations and rules

### Types of Agreements

**Membership Agreement:**
- Required to join pod
- Outlines member responsibilities
- Defines acceptable behavior
- Signed during application

**Accountability Agreement:**
- Required for leaders
- Personal liability clause
- Anti-fraud provisions
- Signed during pod creation

**Custom Agreements:**
- Pod-specific rules
- Special requirements
- Additional terms

### Creating Agreement
1. Write agreement text (Markdown supported)
2. Upload to IPFS
3. Link to pod
4. Mark as required or optional
5. Members must sign before access

![Agreements tab: create an agreement and attach it to a role.](https://app.spiritdao.org/images/docs/pods/11-agreements-tab.png)

### Viewing Signed Agreements
1. Go to pod management
2. Click "Agreements" tab
3. See list of agreements
4. View signatures and timestamps
5. Download agreement text

---

## Pod Permissions

### Permission Types

**View Pod:**
- Public: Anyone can see
- Members Only: Must be member

**Post in Forum:**
- Leaders Only
- All Members
- Public

**Create Events:**
- Leaders Only
- All Members

**Post Bounties:**
- Leaders Only
- Treasury Multi-sig

**Access Treasury:**
- Leaders Only (multi-sig)

### Managing Permissions
1. Go to pod management > Settings
2. Click "Permissions"
3. Select permission level for each feature
4. Save changes
5. Changes apply immediately

---

![Members & Roles: each role carries granular permissions.](https://app.spiritdao.org/images/docs/pods/10-members-roles.png)

## Pod Modules in Detail

![Modules tab: Core, Add-Ons, and Paid.](https://app.spiritdao.org/images/docs/pods/12-modules-tab.png)

### Forum Module
**Enables:**
- Pod-specific discussion board
- Thread creation
- Post replies
- Markdown formatting

**Access:**
- Pod members only (unless set to public)
- Leaders can moderate
- Delete inappropriate posts

### Events Module
**Enables:**
- Pod-specific events
- Event creation
- Registration system
- Attendance NFTs
- Check-in functionality

**Use Cases:**
- Team meetings
- Workshops
- Social gatherings
- Milestone celebrations

### Bounty Module
**Enables:**
- Task marketplace
- Bounty creation
- Application system
- Work submission
- Payment processing

**Funded By:**
- Pod treasury
- Requires treasury module
- Multi-sig approval for large bounties

### Treasury Module
**Enables:**
- Multi-sig wallet
- Hold tokens (USDC, ETH, etc.)
- Fund bounties
- Pay contributors
- Transparent accounting

**Security:**
- Requires multiple leader signatures
- On-chain and auditable
- Protected from single actor

---

![Treasury tab: balances, distribution, approvals.](https://app.spiritdao.org/images/docs/pods/13-treasury-tab.png)

## Best Practices

### As a Leader

**Application Review:**
- Review applications within 48 hours
- Provide feedback if rejecting
- Look for alignment with pod mission
- Check applicant's identity profile

**Member Management:**
- Communicate regularly
- Recognize contributions
- Address issues promptly
- Be fair and consistent

**Module Deployment:**
- Only deploy modules you'll use
- Configure permissions carefully
- Test modules after deployment
- Train members on features

**Treasury Management:**
- Keep balances reasonable
- Use multi-sig for all transactions
- Document all expenditures
- Report to members regularly

### As a Member

**Active Participation:**
- Engage in forum discussions
- Attend pod events
- Complete bounties you take on
- Help new members

**Follow Rules:**
- Honor signed agreements
- Respect pod leaders
- Be professional
- Report issues to leaders

**Contribute Value:**
- Share expertise
- Propose improvements
- Take on bounties
- Support pod mission

---

## Troubleshooting

### "Can't Create Pod" Error
- **Check role**: Must be Executive Pod member
- **Check wallet**: Must be connected
- **Check network**: Must be on Base
- **Try refresh**: Sometimes state gets outdated

### "Application Not Showing"
- **Wait for sync**: Can take 30 seconds
- **Check filter**: Remove any active filters
- **Refresh page**: Force reload
- **Check notifications**: May have been approved/rejected

### "Can't See Module"
- **Check module status**: May not be deployed yet
- **Check permissions**: May not have access
- **Wait for sync**: Module deployment takes time
- **Ask leader**: May need manual access grant

### "Hat Not Received"
- **Wait 60 seconds**: Blockchain sync time
- **Refresh identity page**: Check identity page
- **Check transaction**: View on block explorer
- **Contact leader**: May need manual grant

---

## Advanced Features

### Pod Hierarchy
- Pods can be nested under parent pods
- Inherits some parent permissions
- Creates organizational structure
- Useful for large DAOs

### Time-Based Memberships
- Set expiration dates on Hats
- Members auto-removed after period
- Useful for seasonal roles
- Can be renewed

### Eligibility Criteria Stacking
- Combine multiple requirements
- Example: "Need NFT AND token balance"
- Creates exclusivity
- Protects pod quality

### Cross-Pod Permissions
- Members of one pod get access to another
- Creates collaboration paths
- Simplifies permission management
- Encourages pod interaction

---

## Pod Lifecycle

**1. Creation:**
- Leader creates pod with mission
- Sets up initial structure
- Deploys needed modules

**2. Growth:**
- Accept applications
- Add members
- Expand modules
- Fund treasury

**3. Activity:**
- Regular forum discussions
- Events and meetings
- Bounty completion
- Value creation

**4. Evolution:**
- Update mission as needed
- Adapt structure
- Add/remove modules
- Leadership transitions

**5. Closure (if needed):**
- Complete outstanding bounties
- Distribute remaining treasury
- Archive content
- Formal sunset

---

**Master pod management to build thriving communities! 🌱**
