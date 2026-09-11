# Governance & Voting Guide

## What is DAO Governance?

SpiritDAO uses on-chain governance: all proposals and votes are recorded on the blockchain. This creates:
- **Transparency**: Everyone can see all proposals and votes
- **Permanence**: Decisions can't be changed or hidden
- **Enforceability**: Approved proposals execute automatically
- **Democracy**: Token holders decide together

---

## Requirements for Participation

### To Vote on Proposals
**Required:**
- Advocate (DAO membership accreditation)

Advocate is **auto-delegated when it is minted**, so your voting power is active immediately. There is no manual delegation step.

**How to Check:**
1. Go to **Governance** page
2. See "Voting Power" in top section
3. It reflects your Advocate holdings automatically

### To Create Proposals
**Required:**
- Advocate
- Voting power (active automatically once you hold Advocate)
- Wallet connected to Base network

---

## Voting Power

### What is Voting Power?
- Represents your weight in votes
- Based on number of Advocate tokens you hold
- Active immediately: Advocate is auto-delegated on mint, so you never have to delegate to yourself

### Activating Voting Power
Your Advocate credential is delegated to you automatically when it is minted,
so your voting power is active from day one. If it ever is not (for example a
credential minted before auto-delegation existed), the **Create Proposal**
form shows an **Activate voting power** step: one gasless transaction that
delegates the credential to your own address.

### Delegating to Someone Else
The app does not offer delegation to another member. Each Advocate votes with
their own power. The credential follows the ERC721Votes standard, so
delegation is technically possible directly on the contract, but it is not a
supported path and the app will not show it.

---

## Understanding Proposals

### Proposal Lifecycle

**1. Pending (State 0)**
- Just created
- Waiting for voting period to start
- Cannot vote yet

**2. Active (State 1)**
- Voting is open
- Can cast your vote
- Has countdown timer
- Most critical phase

**3. Defeated/Failed (State 3)**
- Did not get enough votes
- Proposal rejected
- Cannot be executed

**4. Succeeded/Passed (State 4)**
- Got enough votes to pass
- Waiting to be queued
- Victory state

**5. Queued (State 5)**
- Waiting for timelock period
- Safety delay before execution
- Usually 2-7 days

**6. Expired (State 6)**
- Timelock period ended without execution
- Proposal must be recreated

**7. Executed (State 7)**
- Proposal actions were performed
- Changes are live
- Final state

**8. Canceled (State 2)**
- Creator or admin canceled
- Rare state

### Proposal Components

**Title:**
- Clear, descriptive summary
- Appears in all listings
- First thing voters see

**Description:**
- Detailed explanation
- Rationale and context
- Expected outcomes
- Any supporting links

**Forum Thread (Optional):**
- Link to discussion
- Provides more context
- Community feedback

**Voting Duration:**
- How long voting is open
- Usually 3-7 days
- Cannot be changed once created

**Actions (Advanced):**
- Contract calls to execute
- Treasury transfers
- Parameter changes
- Only for technical proposals

---

## Viewing Proposals

### Browse All Proposals
1. Go to **Vote** or **Governance** page
2. See list of all proposals
3. Each card shows:
   - Title and excerpt
   - Current status
   - Vote counts (For/Against/Abstain)
   - Time remaining (if active)
   - Whether you voted

### Filter Proposals
**By Status:**
- **All**: See everything
- **Active**: Can vote now
- **Passed**: Successful proposals
- **Failed**: Rejected proposals
- **Executed**: Completed proposals

**How:**
1. Click filter buttons at top
2. List updates automatically
3. Shows count for each category

### View Proposal Details
1. Click on any proposal card
2. See full page with:
   - Complete description
   - Voting breakdown
   - Vote history
   - Discussion link
   - Execution status

---

## Voting on Proposals

### Cast Your Vote

**Requirements Check:**
1. Must hold Advocate (voting power is active automatically)
2. Proposal must be Active (State 1)
3. You haven't voted on this proposal yet

**Steps:**
1. Go to **Vote** page or **Governance** page
2. Find active proposal
3. Click proposal to view details
4. Click "Vote" button
5. Choose your position:
   - **For**: Support the proposal
   - **Against**: Oppose the proposal
   - **Abstain**: Participate but neutral
6. Add optional comment/reason
7. Click "Cast Vote"
8. Sign transaction
9. Wait for confirmation
10. Your vote is recorded

**After Voting:**
- Proposal card shows "✓ Voted"
- Cannot change vote
- Your voting power counted
- Visible in vote history

### Vote Visibility
- All votes are public
- Anyone can see how you voted
- Promotes accountability
- Part of transparent governance

### Vote Weight
- Your vote weight = your Advocate count
- If you delegated, your delegate votes with your weight
- More Advocate = more voting power

---

## Creating Proposals

### Step 1: Prepare Your Proposal

**Before Creating:**
- ✅ Discuss idea in forum first
- ✅ Get community feedback
- ✅ Refine your proposal
- ✅ Check requirements

**Proposal Quality:**
- Clear title (50 chars or less)
- Detailed description (200+ words)
- Explain "why" not just "what"
- Include expected outcomes
- Link to forum discussion
- Anticipate objections

### Step 2: Navigate to Create Proposal
1. Go to **Governance** page
2. Click "Create Proposal" button
3. Or go directly to `/governance/executive`

### Step 3: Fill Proposal Form

**Title:**
- Concise and descriptive
- Examples:
  - "Allocate 1000 USDC to Marketing Pod"
  - "Update Governance Voting Period to 5 Days"
  - "Approve New Technical Pod"

**Description:**
- Use Markdown formatting
- Include sections:
  - **Summary**: One paragraph overview
  - **Rationale**: Why this is needed
  - **Implementation**: How it will work
  - **Timeline**: When it happens
  - **Budget**: If applicable
  - **Risks**: Potential downsides

**Link to Forum Thread (Recommended):**
1. First create forum post
2. Get discussion going
3. Copy thread URL
4. Paste in proposal form
5. Helps voters see community sentiment

**Token Gating (Optional):**
- Require voters to hold specific token
- Restricts who can vote
- Usually left as "Advocate"

### Step 4: Review Requirements
Before submitting, system checks:
- ✅ Wallet connected
- ✅ Hold at least 1 Advocate
- ✅ Title is 10+ characters
- ✅ Description is 50+ characters
- ✅ Voting power exists (active automatically with Advocate)

### Step 5: Submit Proposal
1. Review all information
2. Click "Submit Proposal"
3. Approve transaction (may have gas cost)
4. Wait for confirmation (30-60 seconds)
5. Proposal appears in listings

**Note:** Proposal creation is NOT sponsored/gasless

### Step 6: Promote Your Proposal
After creating:
- Share in forum
- Post in relevant pod chats
- Explain in Discord/social
- Answer questions
- Be responsive to feedback

---

## Advanced Governance Features

### Proposal Thresholds

**Quorum:**
- Minimum % of votes needed
- Prevents low-turnout decisions
- Usually 4-10% of total supply

**Approval:**
- % of FOR votes needed to pass
- Usually > 50% (simple majority)
- Sometimes higher (supermajority)

**Check Thresholds:**
- Visible on proposal details page
- Shows progress toward quorum
- Updates in real-time

### Voting Countdown
- Shows time remaining to vote
- Updates every minute
- Formats:
  - "2 days 5 hours remaining"
  - "3 hours 22 minutes remaining"
  - "14 minutes remaining"
- Red when under 1 hour

### Timelock Period
**Purpose:**
- Safety delay after proposal passes
- Allows community to react
- Prevents hasty execution

**Duration:**
- Usually 2-7 days
- Set by DAO governance
- Visible in proposal details

**During Timelock:**
- Proposal cannot be executed yet
- Can still be canceled by admin (emergency)
- Community can prepare for changes

### Proposal Execution
**Who Can Execute:**
- Anyone (after timelock expires)
- Usually proposer does it
- Costs gas

**Execution Steps:**
1. Wait for timelock to expire
2. Click "Execute Proposal"
3. Sign transaction
4. Proposal actions run
5. Changes go live

**What Executes:**
- Contract function calls
- Treasury transfers
- Parameter updates
- Whatever was encoded in proposal

---

## Governance Best Practices

### As a Voter

**Do Your Research:**
- Read full proposal
- Check forum discussion
- Understand implications
- Ask questions if unclear

**Vote on Everything:**
- Even if outcome seems certain
- Your participation matters
- Builds governance habits
- Influences future proposals

**Vote Before Deadline:**
- Don't wait until last minute
- Technical issues happen
- Avoid regrets

**Explain Your Vote:**
- Add comment when voting
- Helps others understand reasoning
- Improves governance quality
- Builds community dialogue

### As a Proposal Creator

**Build Consensus First:**
- Discuss in forum before proposing
- Gather feedback
- Refine idea
- Get supporter commitment

**Write Clearly:**
- Plain language, not jargon
- Structure logically
- Proofread carefully
- Make it skimmable

**Be Responsive:**
- Answer questions promptly
- Address concerns
- Be open to amendments
- Stay professional

**Time It Right:**
- Avoid holiday periods
- Give adequate voting time
- Don't rush community
- Be patient

**Accept Outcomes:**
- If proposal fails, learn why
- Don't resubmit immediately
- Revise based on feedback
- Try again later

---

## Governance Participation Tips

### Voting Strategy

**Read Everything:**
- Don't vote based on title alone
- Check forum discussions
- Look at voter history
- Consider precedent

**Think Long-Term:**
- How does this affect DAO in 1 year?
- Creates good or bad precedent?
- Aligns with mission?

**Check Financials:**
- For treasury proposals, verify:
  - DAO can afford it
  - Reasonable price
  - Clear deliverables
  - Accountability measures

**Consider Unintended Consequences:**
- What could go wrong?
- Who might be harmed?
- Better alternatives?

### Delegation Strategy

By default you vote with your own power (Advocate is auto-delegated on mint). Delegating to someone else is optional.

**When to Keep Voting Yourself:**
- You follow proposals actively
- You have time to research
- You enjoy governance
- You want direct control

**When to Delegate to Someone Else:**
- Too busy to track proposals
- Trust someone more knowledgeable
- Want to support aligned voter
- Still want governance influence

**Choosing a Delegate:**
- Check their voting history
- Verify alignment with your values
- Look at participation rate
- Confirm they're active

**Monitor Your Delegate:**
- Review their votes periodically
- Check if they're still active
- Revoke if misaligned
- Delegate back to yourself if they stop voting

---

## Common Scenarios

### "My Vote Didn't Count"
**Possible Causes:**
- Transaction failed (check status)
- Voting ended before confirmation
- Didn't have voting power at proposal creation
- Wallet not connected properly

**Solutions:**
- Check transaction on block explorer
- Verify voting power
- Try again if still active
- Contact support if issue persists

### "Proposal I Supported Failed"
**What to Do:**
- Read comments to understand why
- Learn from objections
- Revise proposal
- Build more support
- Resubmit when appropriate

### "Can't Create Proposal"
**Common Issues:**
- Don't have Advocate → Mint one (voting power activates automatically)
- Title too short → Min 10 characters
- Description too short → Min 50 characters
- Network issues → Try refresh

### "Voting Period Too Short"
**Reality:**
- Voting periods set by governance
- Usually 3-7 days
- Can be changed via proposal
- Set notifications to avoid missing

---

## Governance Analytics

### Viewing Voting History
1. Go to proposal details
2. Scroll to "Votes" section
3. See all votes cast
4. Shows:
   - Voter address
   - Vote choice (For/Against/Abstain)
   - Voting power used
   - Timestamp

### Checking Vote Distribution
- **For**: Green bar, count, percentage
- **Against**: Red bar, count, percentage
- **Abstain**: Gray bar, count, percentage
- **Total**: Sum of all votes

### Participation Rate
- Total votes / Total possible votes
- Shows engagement level
- Higher is better
- Goal: >20% participation

---

## Emergency Situations

### Malicious Proposals
**If You See Malicious Proposal:**
- Vote AGAINST
- Post warning in forum
- Share in chat channels
- Alert DAO leadership
- Explain dangers clearly

**Examples of Malicious:**
- Drains treasury
- Transfers ownership
- Breaks core functionality
- Benefits only proposer

### Governance Attacks
**51% Attack:**
- Bad actor gets >50% voting power
- Can pass any proposal
- Very expensive to execute
- DAO should have circuit breakers

**Flash Loan Attack:**
- Borrow large NFT amount
- Vote maliciously
- Return NFTs
- Prevented by snapshot timing

**Defensive Measures:**
- Timelock period for safety
- Multi-sig for critical functions
- Community vigilance
- Emergency pause capability

---

## Governance Improvement

### Meta-Governance
- Proposals about governance itself
- Change voting periods
- Adjust thresholds
- Modify processes
- Usually need higher approval

### Governance Experiments
- Try new formats
- Test different tools
- Gather feedback
- Iterate and improve

### Community Education
- Share governance guides
- Host voting workshops
- Explain proposals clearly
- Onboard new voters

---

**Governance is the heart of SpiritDAO. Participate actively to shape the community! 🗳️**
