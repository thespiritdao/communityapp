# Supabase Integration Setup for Bounty System

## Overview

The bounty system is now fully integrated with Supabase for data persistence. This guide will help you set up the database and configure the integration.

## Database Setup

### 1. Create Tables

Run the SQL schema in your Supabase SQL editor:

```sql
-- Copy and paste the contents of src/features/bounty/supabase-schema.sql
```

This will create:
- `bounties` table for storing bounty information
- `bids` table for storing bid submissions
- Indexes for optimal performance
- Row Level Security (RLS) policies
- Helper functions and views

### 2. Environment Variables

Make sure you have these environment variables set in your `.env.local`:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Bounty System Configuration
NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=your_bounty_manager_contract_address
NEXT_PUBLIC_BOUNTY_HAT_ID=your_bounty_management_hat_id
NEXT_PUBLIC_SYSTEM_TOKEN=your_system_token_address
NEXT_PUBLIC_SELF_TOKEN=your_self_token_address

# For testing (using Executive Pod)
NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID=your_executive_pod_hat_id
```

## Features

### ✅ **Complete Bounty Lifecycle**

1. **Bounty Creation**: Token-gated creation with requirements and questions
2. **Bidding**: Comprehensive bid forms with detailed proposals
3. **Bid Management**: View and manage bids for bounty creators
4. **Bounty Acceptance**: Accept bids and trigger smart contract calls
5. **Bounty Completion**: Approve completion and release payments

### ✅ **Data Persistence**

- **Bounties**: Stored in Supabase with full metadata
- **Bids**: Complete bid information with answers to custom questions
- **Real-time Updates**: Automatic state synchronization
- **Error Handling**: Comprehensive error handling and user feedback

### ✅ **Security**

- **Row Level Security**: Database-level access control
- **Token Gating**: Hat-based access control for bounty creation
- **Input Validation**: Client and server-side validation
- **Audit Trail**: Complete history of all actions

## Database Schema

### Bounties Table

```sql
CREATE TABLE bounties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    value_amount TEXT NOT NULL,
    value_token TEXT NOT NULL CHECK (value_token IN ('SYSTEM', 'SELF')),
    requirements TEXT[] DEFAULT '{}',
    questions TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'completed')),
    creator_address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Bids Table

```sql
CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    bidder_address TEXT NOT NULL,
    experience TEXT NOT NULL,
    plan_of_action TEXT NOT NULL,
    deliverables TEXT NOT NULL,
    timeline TEXT NOT NULL,
    proposed_amount TEXT NOT NULL,
    answers JSONB DEFAULT '{}',
    additional_notes TEXT DEFAULT '',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Functions

### Bounty API

```typescript
// Get all bounties
bountyApi.getAllBounties(): Promise<Bounty[]>

// Get bounty by ID
bountyApi.getBountyById(id: string): Promise<Bounty | null>

// Create new bounty
bountyApi.createBounty(bountyData): Promise<Bounty>

// Update bounty status
bountyApi.updateBountyStatus(id: string, status: string): Promise<void>

// Get bounties by creator
bountyApi.getBountiesByCreator(creatorAddress: string): Promise<Bounty[]>
```

### Bid API

```typescript
// Get bids for a bounty
bidApi.getBidsForBounty(bountyId: string): Promise<Bid[]>

// Submit a bid
bidApi.submitBid(bidData): Promise<Bid>

// Get bids by bidder
bidApi.getBidsByBidder(bidderAddress: string): Promise<Bid[]>

// Get bid by ID
bidApi.getBidById(id: string): Promise<Bid | null>
```

## Usage

### Creating a Bounty

```typescript
const { createBounty } = useBountySupabase();

const bountyData = {
  title: "Design New Logo",
  description: "Create a modern logo for our DAO",
  category: "Design",
  value: { amount: "100", token: "SYSTEM" },
  requirements: ["Experience with vector graphics"],
  questions: ["What is your design philosophy?"]
};

await createBounty(bountyData);
```

### Submitting a Bid

```typescript
const { submitBid } = useBountySupabase();

const bidData = {
  bountyId: "bounty-uuid",
  experience: "5 years of design experience",
  planOfAction: "I will create 3 concepts...",
  deliverables: "Vector logo files, brand guidelines",
  timeline: "2 weeks",
  proposedAmount: "100",
  answers: { "What is your design philosophy?": "Minimal and modern" },
  additionalNotes: "I'm excited about this project"
};

await submitBid(bidData);
```

## Components

### Core Components

- `BountyForm`: Create bounties with requirements and questions
- `BidForm`: Submit comprehensive bids
- `BountyList`: Display all bounties
- `BountyCard`: Individual bounty display
- `BidViewer`: Manage bids for bounty creators
- `BountyAcceptance`: Accept bids (smart contract integration)
- `BountyCompletion`: Complete bounties (smart contract integration)

### Custom Hooks

- `useBountySupabase`: Main hook for bounty operations
- `useBountyContract`: Smart contract interactions

## Testing

### Sample Data

You can uncomment the sample data in the SQL schema to populate your database with test bounties:

```sql
-- Uncomment the INSERT statements at the bottom of supabase-schema.sql
```

### Manual Testing

1. **Create Bounty**: Use the "Create Bounty" tab (requires token gating)
2. **Submit Bid**: Click "Bid on Bounty" and fill out the comprehensive form
3. **View Bids**: Use the BidViewer component to see submitted bids
4. **Accept Bid**: Use BountyAcceptance to trigger smart contract
5. **Complete Bounty**: Use BountyCompletion to release payment

## Troubleshooting

### Common Issues

1. **Token Gating Not Working**
   - Check console logs for token balance information
   - Verify environment variables are set correctly
   - Ensure your wallet holds the required tokens

2. **Database Connection Issues**
   - Verify Supabase URL and anon key
   - Check RLS policies are configured correctly
   - Ensure tables are created with proper schema

3. **Smart Contract Integration**
   - Verify contract addresses are correct
   - Check that OnchainKit is properly configured
   - Ensure paymaster is set up for sponsored transactions

### Debug Information

The system includes comprehensive logging:

```typescript
// Token balance debugging
console.log('Token balances:', balances);
console.log('Is bounty manager:', balances.hasExecutivePod);

// Database operation debugging
console.log('Bounty created:', newBounty);
console.log('Bid submitted:', newBid);
```

## Next Steps

1. **Deploy Smart Contracts**: Deploy the BountyManager contract
2. **Set Environment Variables**: Configure all required environment variables
3. **Test Integration**: Create test bounties and bids
4. **Add Features**: Implement additional features like notifications, search, etc.

The bounty system is now fully functional with Supabase integration! 