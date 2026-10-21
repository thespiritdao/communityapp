# Bounties System Guide

## What are Bounties?

Bounties are task-based rewards in SpiritDAO. They allow:
- **Posters**: Define tasks and offer rewards
- **Contributors**: Apply to complete tasks and earn crypto
- **Transparency**: All work and payments on-chain
- **Flexibility**: From simple tasks to complex projects

---

## Bounty Roles

### Bounty Creator
- Posts the bounty
- Sets reward amount
- Reviews applications
- Approves work submissions
- Releases payments

### Applicant/Bidder
- Applies to complete bounty
- Submits proposal/bid
- If approved, becomes assignee
- Completes the work

### Assignee/Worker
- Approved applicant
- Does the actual work
- Submits work for review
- Receives payment when approved

### Reviewer (Advanced)
- Reviews submitted work
- Technical or final approver
- Ensures quality standards
- Can reject incomplete work

---

## Browsing Bounties

### View All Bounties
1. Go to **Bounty** page
2. See list of all bounties
3. Each card shows:
   - Title and description
   - Reward amount and token
   - Status (Open, Assigned, Completed)
   - Number of applications
   - Pod (if pod-specific)

![The bounty board.](https://app.spiritdao.org/images/docs/bounties/01-bounty-board.png)

### Filter Bounties

**By Status:**
- **Open**: Accepting applications
- **In Progress**: Assigned to someone
- **Under Review**: Work submitted, being reviewed
- **Completed**: Finished and paid
- **Canceled**: No longer active

**By Pod:**
- **All Bounties**: DAO-wide
- **Pod-Specific**: Only for pod members
- Filter by specific pod

### View Bounty Details
1. Click on bounty card
2. See full information:
   - Complete description
   - Requirements and deliverables
   - Payment terms
   - Timeline/deadline
   - Milestones (if any)
   - Current applications
   - Assigned worker (if applicable)

---

![A bounty: value, deadline, requirements, and Apply.](https://app.spiritdao.org/images/docs/bounties/02-bounty-detail.png)

## Understanding Bounty Types

### Simple Bounty
- Single task
- One payment
- Complete and deliver
- Example: "Write blog post - 50 $SYSTEM"

### Milestone Bounty
- Multiple phases
- Payment per milestone
- Phased delivery
- Example:
  - Milestone 1: Design (20 $SYSTEM)
  - Milestone 2: Development (50 $SYSTEM)
  - Milestone 3: Testing (30 $SYSTEM)

### Recurring Bounty
- Repeatable task
- Multiple contributors can complete
- Examples:
  - Weekly content creation
  - Monthly reports
  - Ongoing moderation

---

## Applying for Bounties

### Check Eligibility

Every bounty says who can apply. There are three kinds:

- **Any SpiritDAO member.** Anyone who has finished onboarding (holds Proof of Curiosity or Advocate).
- **Members of a pod.** Only members and leaders of the sponsoring pod. Apply to join that pod first.
- **Holders of specific credentials.** The creator picked one or more credentials, and holding *any one* of them is enough: membership of a named pod, or a token such as Advocate, Proof of Curiosity, $SYSTEM, $SELF or $TGN.

**How to Check:**
1. Open the bounty details
2. Read the **Who can apply** line
3. If you qualify, the **Bid** button is active
4. If not, the line underneath says exactly what you're missing

Eligibility is enforced when you bid, not only in the display, so a bid you are not eligible for is refused.

### Submit Application

**Step 1: Click "Apply for Bounty"**
- On bounty details page
- Or from bounty card
- Must meet eligibility first

**Step 2: Fill Application Form**

**Proposed Approach:**
- How will you complete this task?
- Your methodology
- Tools/resources you'll use
- 100-500 words

**Timeline:**
- How long will it take?
- Be realistic
- Factor in revisions
- Underpromise, overdeliver

**Budget/Payment:**
- Usually fixed by poster
- Sometimes negotiable
- Justify if requesting more
- Break down by milestone

**Relevant Experience:**
- Past similar work
- Skills that apply
- Portfolio links
- References

**Additional Information:**
- Anything else relevant
- Questions for poster
- Special considerations

**Step 3: Review and Submit**
1. Double-check for typos
2. Ensure all fields filled
3. Click "Submit Application"
4. Sign transaction (gasless)
5. Wait for confirmation

**After Submitting:**
- Application appears in bounty
- Poster receives notification
- You can edit until reviewed
- Status: "Pending"

![Applying: experience, plan, deliverables, proposed amount.](https://app.spiritdao.org/images/docs/bounties/03-apply-form.png)

### Application Status

**Pending:**
- Submitted, awaiting review
- Can still edit
- Wait for poster decision

**Approved:**
- You got the bounty!
- Receive notification
- Escrow funded (if applicable)
- Start work

**Rejected:**
- Not selected
- Check feedback if provided
- Can apply to other bounties
- Don't be discouraged

---

![Your applications and their status.](https://app.spiritdao.org/images/docs/bounties/04-application-status.png)

## Working on Assigned Bounties

### After Assignment
1. You receive notification
2. Bounty status → "In Progress"
3. Payment locked in escrow
4. You appear as "Assignee"
5. Begin work

### During Work

**Stay Communicated:**
- Update poster on progress
- Ask questions early
- Flag any blockers
- Don't go silent

**Follow Requirements:**
- Refer to bounty description
- Meet all deliverables
- Match quality expectations
- Respect timeline

**Track Milestones:**
- If milestone bounty, complete in order
- Submit each milestone for review
- Wait for approval before next
- Partial payments released

### Submitting Work

**Step 1: Navigate to Bounty**
1. Go to **Bounty** page
2. Find your assigned bounty
3. Click to view details
4. See "Submit Work" button

**Step 2: Prepare Submission**

**Deliverables:**
- Upload files (if applicable)
- Provide links (GitHub, Drive, etc.)
- Include documentation
- Add README if needed

**Description:**
- Explain what you did
- How you met requirements
- Any notes for reviewer
- Known limitations

**Demo/Preview:**
- Screenshots
- Video walkthrough
- Live demo link
- Test credentials (if app)

**Step 3: Submit for Review**
1. Click "Submit Completed Work"
2. Fill submission form
3. Add links and files
4. Write description
5. Click "Submit"
6. Sign transaction
7. Wait for confirmation

**After Submission:**
- Status → "Under Review"
- Reviewer receives notification
- Cannot edit submission
- Wait for feedback

---

![Submitting work for review.](https://app.spiritdao.org/images/docs/bounties/05-submit-work.png)

## Work Review Process

### If You're the Reviewer

**Review Work:**
1. Go to bounty details
2. See "Review Submission" section
3. Download/view deliverables
4. Test functionality
5. Check against requirements

**Provide Feedback:**
- **Approve**: Work meets standards
- **Request Changes**: Needs revisions
- **Reject**: Does not meet requirements

**Approval:**
1. Click "Approve"
2. Confirm decision
3. Payment automatically released
4. Assignee receives funds
5. Bounty marked "Completed"

**Request Changes:**
1. Click "Request Changes"
2. Write specific feedback
3. List what needs fixing
4. Give reasonable deadline
5. Worker submits revised version

**Rejection:**
1. Click "Reject"
2. Provide detailed reason
3. Worker receives notification
4. Payment returned to poster
5. Bounty reopened or canceled

![Reviewing a submission: approve, request revision, or reject.](https://app.spiritdao.org/images/docs/bounties/06-review-work.png)

### If You're the Worker

**Approval:**
- Receive notification
- Payment sent to wallet
- Bounty completed
- Added to your track record

**Changes Requested:**
- Read feedback carefully
- Make requested revisions
- Resubmit work
- May require multiple rounds

**Rejection:**
- Understand reason
- Learn from feedback
- No payment received
- Can appeal if unfair

---

## Creating Bounties

**Required:**
- Be pod leader OR
- Have bounty posting permission OR
- Have executive pod access

### Step 1: Navigate to Create Bounty
1. Go to **Bounty** page
2. Click "Create Bounty" button
3. Or go through pod management

### Step 2: Fill Bounty Details

**Title:**
- Clear, specific task name
- 50 characters or less
- Examples:
  - "Design SpiritDAO Logo"
  - "Write 5 Tutorial Articles"
  - "Audit Smart Contracts"

**Description:**
- Detailed task explanation
- What needs to be done
- Expected deliverables
- Quality standards
- Any specific requirements
- Use Markdown formatting

**Example Description:**
```

![Create a bounty: pod, who can apply, title, category, amount.](https://app.spiritdao.org/images/docs/bounties/07-create-bounty.png)
# Task: Create Tutorial Videos

Create 3 tutorial videos for SpiritDAO:
1. How to Create a Pod (5-7 min)
2. How to Vote on Proposals (3-5 min)
3. How to Apply for Bounties (4-6 min)

## Requirements:
- 1080p resolution
- Clear audio
- Professional editing
- Captions/subtitles
- Brand colors

## Deliverables:
- 3 MP4 files
- Source files (Premiere/Final Cut)
- Thumbnail images
- Upload to YouTube
```

### Who Can Apply

Every bounty carries one of three eligibility settings. Pick it in the **Who Can Apply** box on the form; the line under it previews exactly who qualifies.

- **Members of this pod.** Only members and leaders of the sponsoring pod. The default.
- **Any SpiritDAO member.** Anyone who has finished onboarding.
- **Holders of specific credentials.** Tick one or more credentials from two groups: membership of any pod, or a token or accreditation (Advocate, Proof of Curiosity, $SYSTEM, $SELF, $TGN). Holding *any one* ticked credential is enough. Pick at least one.

What applicants see: the bounty details show a **Who can apply** line, and anyone who doesn't qualify gets one sentence saying what they're missing instead of a Bid button. The rule is enforced when a bid is submitted, not only in the display.

**Reward Amount:**
- How much you'll pay
- In $SYSTEM or $SELF
- Be competitive
- Research comparable bounties
- Factor in complexity

**Payment Token:**
- **$SYSTEM**: a transferable reward, paid to the worker from the bounty's escrow/treasury on approval. The funding source needs a sufficient $SYSTEM balance.
- **$SELF**: a participation reward, **minted** to the worker on approval (soulbound, so it's created for them, not transferred; no pre-existing balance is moved). Recognizes verified contribution rather than paying out capital.

**Timeline/Deadline:**
- Expected completion date
- Be realistic
- Factor in review time
- Can be extended later

**Milestones (Optional):**
- Break into phases
- Set payment per phase
- Milestone descriptions
- Phased delivery

### Step 3: Fund Bounty

Every bounty is escrowed: the full amount is pulled into the bounty
contract when you create it, released when work is approved, and refunded
if the bounty is cancelled. There is no pay-on-completion option.

**Choose the funding source:**
- **Your wallet** — the amount comes from your own $SYSTEM or $SELF. The
  app approves and escrows in one gasless transaction. The pod does not
  need a treasury for this.
- **Pod treasury** — the amount comes from the pod's treasury. You must be
  a pod leader (or hold a role authorised for treasury funding), and the
  treasury must already hold at least the bounty amount in that token. Top
  it up first with the **Fund** button on the pod page if it does not.

**Steps:**
1. Pick the funding source and the token
2. Press Create — one gasless transaction
3. Wait for confirmation (usually under a minute)
4. Bounty goes live

If the funding source cannot cover the amount, the form tells you before
sending. If the network still rejects the transaction, the most common cause
is the same: not enough of the chosen token where you are funding from.

![Funding from your wallet or the pod treasury.](https://app.spiritdao.org/images/docs/bounties/08-fund-bounty.png)

### Step 4: Review and Create
1. Double-check all details
2. Preview how it looks
3. Click "Create Bounty"
4. Approve funding transactions
5. Wait for bounty to appear (30 seconds)

**After Creation:**
- Bounty appears in listings
- Status: "Open"
- Accepting applications
- You receive notifications for apps

---

## Managing Your Bounties

### As Bounty Poster

**Review Applications:**
1. Go to bounty details
2. See "Applications" tab
3. Read each application
4. Compare approaches
5. Check applicant profiles

**Approve Applicant:**
1. Select best application
2. Click "Approve"
3. Confirm decision
4. Applicant notified
5. Bounty status → "In Progress"

**Monitor Progress:**
- Check in with assignee
- Answer questions
- Provide guidance
- Watch for updates

**Review Submissions:**
- Test deliverables thoroughly
- Check against requirements
- Provide detailed feedback
- Approve or request changes

**Cancel Bounty:**
- If no longer needed
- Refunds escrow to you
- Notify applicants/assignee
- Provide reason

![Manage tab: applications, assignments, payments.](https://app.spiritdao.org/images/docs/bounties/09-manage-bounties.png)

### As Bounty Worker

**Track Your Bounties:**
1. Go to **My Activity** page
2. See all your bounties:
   - Applied
   - Assigned
   - Under Review
   - Completed

**Manage Applications:**
- Edit pending applications
- Withdraw applications
- Respond to questions

**Submit Updates:**
- For milestone bounties
- Submit each phase
- Get approval to continue

**Communicate:**
- Message poster
- Ask questions
- Share progress
- Be responsive

---

## Bounty Payments

### Payment Flow

**1. Bounty Created:**
- Poster funds escrow
- Funds locked in contract

**2. Work Assigned:**
- Funds remain in escrow
- Protected for worker

**3. Work Approved:**
- Smart contract releases payment
- Sent to worker's wallet
- Automatic and immediate

**4. Transaction Complete:**
- Bounty marked completed
- Added to both party records
- Immutable on blockchain

### Payment Methods

**Escrow (Recommended):**
- Funds locked upfront
- Released on approval
- Secure for workers
- Standard practice

**Pay-on-Completion:**
- Payment after work done
- No escrow
- Requires trust
- Faster to post

**Milestone Payments:**
- Partial payments per phase
- Reduces risk for both
- Encourages progress
- More complex setup

### Handling Payment Issues

**Payment Not Received:**
- Check wallet address
- Verify network (Base)
- Check transaction on explorer
- Wait 60 seconds for sync
- Contact support if issue persists

**Disputed Payment:**
- If reviewer rejects unfairly
- Discuss with poster first
- Escalate to pod leadership
- Use DAO governance if needed

**Partial Payment:**
- For milestone completion
- Each phase paid separately
- Final payment on full completion

---

## Best Practices

### For Bounty Posters

**Write Clear Descriptions:**
- Specific requirements
- Measurable outcomes
- Examples of good work
- Common mistakes to avoid

**Set Fair Compensation:**
- Research market rates
- Value expertise appropriately
- Don't lowball skilled work
- Factor in revisions

**Respond Quickly:**
- Review applications within 48h
- Answer questions promptly
- Give clear feedback
- Respect contributors' time

**Provide Good Feedback:**
- Specific, not vague
- Actionable suggestions
- Recognize good work
- Be professional

### For Bounty Workers

**Apply Selectively:**
- Only to bounties you can deliver
- Don't overpromise
- Be realistic about timeline
- Quality over quantity

**Write Strong Applications:**
- Show you understand task
- Demonstrate relevant experience
- Provide examples
- Differentiate yourself

**Communicate Proactively:**
- Update on progress
- Ask questions early
- Flag potential issues
- Don't go dark

**Deliver Quality Work:**
- Meet all requirements
- Double-check everything
- Provide documentation
- Make reviewer's job easy

**Be Professional:**
- Meet deadlines
- Accept feedback gracefully
- Learn from rejections
- Build reputation

---

## Advanced Features

### Multi-Sig Bounties
**For High-Value Tasks:**
- Requires multiple approvers
- Reduces single-point risk
- Usually 2-3 signatures
- Slower but more secure

### Recurring Bounties
**For Ongoing Tasks:**
- Weekly/monthly work
- Multiple contributors
- Automated payments
- Examples: Content, moderation

### Bounty Templates
**Quick Creation:**
- Save common bounty types
- Reuse structure
- Update details
- Faster posting

### Bounty Competitions
**Multiple Winners:**
- Accept multiple submissions
- Reward best ones
- Encourages creativity
- Community votes on winners

---

## Bounty Reputation

### Building Your Profile
**Completed Bounties:**
- Show in your profile
- Proof of work
- Attracts more opportunities
- Builds trust

**Success Rate:**
- Completed vs. attempted
- Higher is better
- Visible to posters
- Affects future selection

**Avg. Rating:**
- Posters rate your work
- 1-5 stars
- Comments visible
- Impacts applications

**Specializations:**
- Tags for skills
- Design, code, writing, etc.
- Helps posters find you
- Built from completed work

### Reputation Benefits
- Higher-value bounties
- Faster approvals
- Negotiating power
- Community respect

---

## Common Scenarios

### "Can't Apply to Bounty"
**Possible Causes:**
- Don't meet eligibility
- Not in required pod
- Already applied
- Bounty is assigned

**Solutions:**
- Check eligibility requirements
- Join required pod
- Wait for other bounties
- Build qualifying reputation

### "Application Rejected"
**What to Do:**
- Read rejection reason
- Learn from feedback
- Improve future applications
- Don't take personally
- Try other bounties

### "Poster Not Responding"
**Steps:**
- Wait 48 hours
- Message again politely
- Check their activity
- If still silent, withdraw
- Report if pattern emerges

### "Work Rejected Unfairly"
**Options:**
- Request specific feedback
- Discuss with poster
- Offer revisions
- Escalate to pod leadership
- Use dispute resolution

---

## Troubleshooting

### Transaction Failed
- Check wallet balance
- Verify network (Base)
- Try Smart Wallet option
- Increase gas limit
- Wait and retry

### Escrow Not Funded
- Check approval transaction
- May need two transactions
- Wait for both confirmations
- Refresh after 60 seconds

### Payment Not Released
- Verify approval completed
- Check transaction status
- Wait 60 seconds for sync
- Check correct wallet address

### Can't Submit Work
- Ensure bounty is assigned to you
- Check file size limits
- Verify required fields filled
- Try different browser

---

**Bounties are how SpiritDAO rewards contributors. Build your reputation and earn! 💰**
