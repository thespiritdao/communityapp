# Bounty System

The bounty system is a modular feature that allows different pods (working groups) to create and manage bounties. It is token-gated using the Hats Protocol for access control.

## Features

- Public-facing interface for viewing and bidding on bounties
- Token holder interface for creating and managing bounties
- On-chain bounty management using smart contracts
- Notification system for bounty-related events
- Tagging system for categorizing bounties

## Components

### Smart Contract

The `BountyManager.sol` contract handles all on-chain bounty operations:
- Creating bounties
- Placing bids
- Assigning bounties
- Approving completion
- Cancelling bounties

### Frontend Components

1. `BountyCard`: Displays individual bounty information
2. `BountyList`: Grid layout of bounty cards
3. `BountyForm`: Form for creating new bounties
4. `BountyNotifications`: Handles bounty-related notifications

### Hooks

1. `useBounty`: Manages local bounty state and notifications
2. `useBountyContract`: Interacts with the smart contract
3. `useBountyContext`: Provides global bounty state management

## Setup

1. Deploy the `BountyManager` contract with the SYSTEM and SELF token addresses
2. Set the following environment variables:
   ```
   NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=<deployed_contract_address>
   NEXT_PUBLIC_BOUNTY_HAT_ID=<hat_id>
   ```

## Usage

### Creating a Bounty

Only token holders can create bounties. The process involves:
1. Filling out the bounty form with title, description, category, and value
2. Selecting reviewers
3. Approving token transfer
4. Submitting the transaction

### Bidding on a Bounty

Any user can bid on open bounties:
1. View the bounty details
2. Click the "Bid" button
3. Confirm the transaction

### Managing Bounties

Token holders can:
1. Review and assign bidders
2. Approve bounty completion
3. Cancel bounties if necessary

## Integration

The bounty system integrates with:
- Hats Protocol for access control
- SYSTEM and SELF tokens for payments
- Notification system for updates
- Tagging system for categorization

## Security

- All transactions are wrapped in Coinbase's OnchainKit Transaction component
- Smart contract includes reentrancy protection
- Access control through Hats Protocol
- Multi-reviewer approval system for bounty completion

# Bounty System Integration

This bounty system has been integrated into the community DAO application with the following features:

## Overview

The bounty system allows token holders to create and manage bounties, while any user can view and bid on open bounties. It integrates with Coinbase's OnchainKit for transaction handling and uses the existing token balance checking system.

## Features

### For Token Holders (Executive Pod, Dev Pod, Market Admin)
- Create new bounties with title, description, category, and value
- Set bounty value in SYSTEM or SELF tokens
- Assign reviewers for bounty completion
- Approve bounty completion
- Cancel bounties if necessary

### For All Users
- View all public bounties
- Bid on open bounties
- Track bounty status (open, in-progress, completed)

## Components

### Core Components
- `BountyCard`: Displays individual bounty information
- `BountyList`: Grid layout of bounty cards
- `BountyForm`: Form for creating new bounties
- `BountyNotifications`: Handles bounty-related notifications

### UI Components
- `Tabs`: For switching between public bounties and create bounty views
- `Card`: For bounty card layout
- `Badge`: For status and category display
- `Button`: For actions like bidding
- `Input`, `Textarea`, `Select`: For form inputs
- `Label`: For form labels

## Integration Points

### Token Balance Checking
Uses the existing `fetchTokenBalances` utility to check if users have the required tokens:
- Executive Pod tokens
- Dev Pod tokens  
- Market Admin tokens

### Transaction Handling
Integrates with Coinbase's OnchainKit `Transaction` component for:
- Bounty creation
- Bidding on bounties
- Approving completion

### Styling
Follows the same design patterns as the shopping cart feature:
- Consistent color scheme
- Responsive design
- Hover effects and animations
- Loading and error states

## File Structure

```
src/features/bounty/
├── components/
│   ├── BountyCard.tsx
│   ├── BountyList.tsx
│   ├── BountyForm.tsx
│   └── BountyNotifications.tsx
├── hooks/
│   ├── useBounty.ts
│   └── useBountyContract.ts
├── context/
│   └── BountyContext.tsx
├── styles/
│   └── bounty.css
└── README.md
```

## Usage

### Creating a Bounty
1. Navigate to `/bounty`
2. If you have the required tokens, you'll see a "Create Bounty" tab
3. Fill out the bounty form with title, description, category, and value
4. Submit the transaction using OnchainKit

### Bidding on a Bounty
1. View open bounties in the "Public Bounties" tab
2. Click "Bid on Bounty" on any open bounty
3. Confirm the transaction

## Environment Variables

The following environment variables are used:
- `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS`: Smart contract address for bounty management
- `NEXT_PUBLIC_HATS_ADDRESS`: Hats Protocol contract address
- `NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID`: Hat ID for executive pod access
- `NEXT_PUBLIC_DEV_POD_HAT_ID`: Hat ID for dev pod access
- `NEXT_PUBLIC_MARKET_ADMIN_HAT_ID`: Hat ID for market admin access
- `NEXT_PUBLIC_SYSTEM_TOKEN`: SYSTEM token contract address
- `NEXT_PUBLIC_SELF_TOKEN`: SELF token contract address

## Dependencies

- `@coinbase/onchainkit`: For transaction handling
- `@radix-ui/react-*`: For UI components
- `class-variance-authority`: For component variants
- `clsx` and `tailwind-merge`: For class name management
- `lucide-react`: For icons

## Future Enhancements

- Bounty search and filtering
- Bounty categories and tags
- Bounty completion workflow
- Bounty dispute resolution
- Bounty analytics and reporting 