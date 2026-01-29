# Fix Forum Reactions RLS Error

## Problem
Users get a 403 Forbidden error when trying to add emoji reactions:
```
new row violates row-level security policy for table "forum_post_reactions"
```

## Solution
Add RLS policies to allow users to create and delete their own reactions.

## How to Apply

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste this SQL:

```sql
-- Enable RLS on forum_post_reactions
ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read reactions
CREATE POLICY "Anyone can read forum reactions"
ON forum_post_reactions
FOR SELECT
USING (true);

-- Policy: Users can insert their own reactions
CREATE POLICY "Users can create their own reactions"
ON forum_post_reactions
FOR INSERT
WITH CHECK (
  auth.uid()::text = reactor_address
  OR
  lower(auth.uid()::text) = lower(reactor_address)
);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
ON forum_post_reactions
FOR DELETE
USING (
  auth.uid()::text = reactor_address
  OR
  lower(auth.uid()::text) = lower(reactor_address)
);
```

5. Click **Run** or press `Ctrl+Enter`
6. Verify success - you should see "Success. No rows returned"

### Option 2: Supabase CLI

```bash
supabase db push
```

## What This Does

- **Enables RLS**: Turns on Row Level Security for the forum_post_reactions table
- **Read Policy**: Allows anyone to see all reactions
- **Insert Policy**: Users can only create reactions with their own wallet address
- **Delete Policy**: Users can only delete their own reactions

## Testing

After applying:
1. Go to any forum thread
2. Click the 😊 + button
3. Select an emoji
4. It should add successfully without 403 error
5. Click the emoji again - it should remove

## Security

- Users can only create reactions using their own wallet address
- Users can only delete their own reactions
- All users can see all reactions (public read access)
- Lowercase address comparison ensures case-insensitive matching
