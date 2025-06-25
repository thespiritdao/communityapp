# Enhanced Bounty System Implementation Guide

## Overview

This guide explains how to implement the enhanced bounty system with milestones, escrow, and automatic payments. The system supports three payment structures:

1. **Completion-based**: Pay the full amount when the bounty is completed
2. **Milestone-based**: Pay per milestone as work is completed
3. **Split payment**: Pay upfront + completion amounts

## Architecture

### Smart Contract: BountyManagerEnhanced.sol

The enhanced contract includes:

- **Escrow functionality**: Funds are held in escrow when a bid is accepted
- **Milestone support**: Create and approve milestones for payment
- **Automatic payments**: Payments are released when reviewers approve milestones
- **Multiple payment structures**: Support for completion, milestone, and split payments

### Key Features

1. **Escrow System**: 
   - Funds move to escrow when bounty is assigned
   - Automatic payment release on milestone approval
   - Emergency withdrawal for admins

2. **Milestone Management**:
   - Create milestones with descriptions, due dates, and payment amounts
   - Reviewer approval system for milestones
   - Automatic payment release when all reviewers approve

3. **Payment Structures**:
   - **Completion**: Full payment on completion approval
   - **Milestones**: Individual payments per milestone
   - **Split**: Upfront payment + completion payment

## Implementation Steps

### 1. Deploy the Enhanced Contract

```bash
# Deploy the enhanced bounty manager
npx hardhat run scripts/deploy-bounty-enhanced.js --network <your-network>
```

### 2. Update Environment Variables

Add these to your `.env.local`:

```bash
# Enhanced Bounty Manager
NEXT_PUBLIC_BOUNTY_MANAGER_ENHANCED_ADDRESS=<deployed_contract_address>
NEXT_PUBLIC_SYSTEM_TOKEN=<system_token_address>
NEXT_PUBLIC_SELF_TOKEN=<self_token_address>

# For testing
NEXT_PUBLIC_BOUNTY_HAT_ID=<bounty_management_hat_id>
```

### 3. Update Frontend Integration

#### A. Enhanced Contract Hook

Use `useBountyContractEnhanced` instead of the basic hook:

```typescript
import { useBountyContractEnhanced, PaymentStructure } from '../hooks/useBountyContractEnhanced';

const {
  createBountyOnChain,
  createMilestonesOnChain,
  approveMilestoneOnChain,
  PaymentStructure,
} = useBountyContractEnhanced();
```

#### B. Create Bounty with Payment Structure

```typescript
// For milestone-based payment
await createBountyOnChain(
  title,
  description,
  category,
  value,
  token,
  reviewers,
  PaymentStructure.Milestones,
  '0', // upfront amount
  value // completion amount
);

// For split payment
await createBountyOnChain(
  title,
  description,
  category,
  value,
  token,
  reviewers,
  PaymentStructure.Split,
  upfrontAmount,
  completionAmount
);
```

#### C. Create Milestones

```typescript
// After accepting a bid, create milestones
await createMilestonesOnChain(
  bountyId,
  ['Design mockups', 'Final implementation', 'Testing and deployment'],
  [dueDate1, dueDate2, dueDate3], // Unix timestamps
  ['100', '200', '100'] // Payment amounts
);
```

#### D. Approve Milestones

```typescript
// Approve a milestone (triggers payment)
await approveMilestoneOnChain(bountyId, milestoneId);
```

### 4. Frontend Components

#### A. MilestoneManager Component

The `MilestoneManager` component handles:
- Creating milestones for a bounty
- Displaying existing milestones
- Approving milestones (triggers payment)

```typescript
<MilestoneManager
  bounty={bounty}
  milestones={milestones}
  onMilestonesCreated={handleMilestonesCreated}
  onMilestoneApproved={handleMilestoneApproved}
/>
```

#### B. Enhanced BidForm

The `BidForm` component now supports:
- Multiple deliverables with dates
- Payment structure selection
- Milestone-based payment amounts

#### C. Enhanced BidReviewManager

The `BidReviewManager` includes:
- Milestone creation after bid approval
- Milestone approval workflow
- Payment tracking

### 5. Database Schema Updates

The existing Supabase schema already supports milestones. Key tables:

- `milestones`: Stores milestone information
- `bids`: Enhanced with payment structure and details
- `bounty_notifications`: For milestone-related notifications

### 6. Workflow Integration

#### A. Bounty Creation Workflow

1. **Create Bounty**: Token holder creates bounty with payment structure
2. **Bidding**: Users submit bids with deliverables and payment preferences
3. **Review**: Admin reviews and approves bid
4. **Escrow**: Funds move to escrow automatically
5. **Milestone Creation**: Admin creates milestones (if milestone-based)

#### B. Milestone Workflow

1. **Create Milestones**: Admin creates milestones with descriptions and amounts
2. **Work Progress**: Worker completes milestones
3. **Review**: Reviewers approve completed milestones
4. **Payment**: Automatic payment release on approval
5. **Completion**: Bounty marked complete when all milestones done

#### C. Payment Workflow

1. **Escrow Funding**: Funds move to escrow on bid acceptance
2. **Milestone Approval**: Reviewers approve milestones
3. **Automatic Payment**: Payment released to worker
4. **Escrow Tracking**: Contract tracks escrow balances

## Payment Structure Examples

### 1. Completion-based Payment

```typescript
// Create bounty
await createBountyOnChain(
  "Design Website",
  "Create a modern website design",
  "Design",
  "500",
  "SYSTEM",
  reviewers,
  PaymentStructure.Completion,
  "0",
  "500"
);

// Approve completion
await approveCompletionOnChain(bountyId);
```

### 2. Milestone-based Payment

```typescript
// Create bounty
await createBountyOnChain(
  "Build App",
  "Develop a mobile application",
  "Development",
  "1000",
  "SELF",
  reviewers,
  PaymentStructure.Milestones,
  "0",
  "1000"
);

// Create milestones
await createMilestonesOnChain(
  bountyId,
  ["UI Design", "Core Features", "Testing & Launch"],
  [dueDate1, dueDate2, dueDate3],
  ["300", "500", "200"]
);

// Approve milestones
await approveMilestoneOnChain(bountyId, milestoneId1);
await approveMilestoneOnChain(bountyId, milestoneId2);
await approveMilestoneOnChain(bountyId, milestoneId3);
```

### 3. Split Payment

```typescript
// Create bounty
await createBountyOnChain(
  "Marketing Campaign",
  "Run a comprehensive marketing campaign",
  "Marketing",
  "800",
  "SYSTEM",
  reviewers,
  PaymentStructure.Split,
  "200", // upfront
  "600"  // completion
);

// Upfront payment happens immediately
// Completion payment on approval
await approveCompletionOnChain(bountyId);
```

## Security Considerations

### 1. Access Control

- Only bounty creators can create bounties
- Only reviewers can approve milestones
- Only admins can perform emergency operations

### 2. Escrow Security

- Funds are held in the contract
- Automatic release on approval
- Emergency withdrawal for admins
- Reentrancy protection

### 3. Milestone Validation

- Total milestone amounts must equal bounty value
- All reviewers must approve before payment
- Due date validation

## Testing

### 1. Contract Testing

```bash
# Run contract tests
npx hardhat test

# Test specific scenarios
npx hardhat test --grep "milestone"
npx hardhat test --grep "escrow"
```

### 2. Frontend Testing

```bash
# Run frontend tests
npm test

# Test bounty creation
npm test -- --testNamePattern="BountyForm"
```

### 3. Integration Testing

1. Create a bounty with milestones
2. Submit and approve a bid
3. Create milestones
4. Approve milestones
5. Verify payments

## Monitoring and Analytics

### 1. Contract Events

Monitor these events:
- `BountyCreated`
- `BountyAssigned`
- `MilestoneCreated`
- `MilestoneCompleted`
- `PaymentReleased`
- `EscrowFunded`

### 2. Database Tracking

Track in Supabase:
- Milestone completion rates
- Payment processing times
- Reviewer activity
- Escrow balances

## Troubleshooting

### Common Issues

1. **Milestone amounts don't match bounty value**
   - Ensure total milestone amounts equal bounty value
   - Check for rounding errors

2. **Payment not released**
   - Verify all reviewers have approved
   - Check escrow balance
   - Ensure milestone status is correct

3. **Contract deployment issues**
   - Verify token addresses are correct
   - Check network configuration
   - Ensure sufficient gas

### Debug Commands

```bash
# Check escrow balance
npx hardhat console --network <network>
> const contract = await ethers.getContractAt("BountyManagerEnhanced", address)
> await contract.getEscrowBalance(tokenAddress)

# Check milestone status
> await contract.getMilestone(milestoneId)
```

## Next Steps

1. **Deploy the enhanced contract**
2. **Update environment variables**
3. **Test the milestone workflow**
4. **Integrate with existing bounty system**
5. **Add monitoring and analytics**
6. **Implement additional features**

The enhanced bounty system provides a robust foundation for complex project management with automatic payments and milestone tracking. 