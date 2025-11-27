# Test Plan: Proposal State Error Handling

**Issue:** #17 - Governance Proposal State Fetch Can Fail Silently
**Date:** November 25, 2025

---

## Test Objectives

1. Verify retry logic works for temporary network failures
2. Confirm error state is properly displayed to users
3. Ensure error state doesn't prevent viewing proposal details
4. Validate user can distinguish between error state vs valid states

---

## Manual Test Scenarios

### Test 1: Normal State Fetch (Baseline)

**Scenario:** Fetch proposal state with working RPC connection

**Steps:**
1. Navigate to `/governance` page
2. Observe proposals list loading
3. Check proposal cards display correct state badges

**Expected Result:**
- All proposals show valid states (Pending/Active/Defeated/etc.)
- No error warnings displayed
- State badges show appropriate colors

---

### Test 2: Temporary Network Failure (Retry Success)

**Scenario:** Simulate temporary network issue that resolves on retry

**Setup:**
```typescript
// Temporarily modify src/utils/contractReadRetry.ts for testing
// Add artificial failure on first attempt:

export async function retryContractRead<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // ... existing code ...

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // TEST: Fail first attempt
      if (attempt === 0) {
        throw new Error('Test: Simulated network failure');
      }

      return await operation();
    } catch (error) {
      // ... rest of retry logic
    }
  }
}
```

**Steps:**
1. Apply test modification
2. Navigate to `/governance` page
3. Check browser console for retry logs
4. Observe proposal state loads successfully

**Expected Result:**
- Console shows: `[Proposal X] Retry 1/3 - Failed to fetch state: Test: Simulated network failure`
- Console shows: `[Proposal X] State fetched successfully: 1` (or other valid state)
- Proposal displays correct state without error warning
- User sees no disruption

---

### Test 3: Persistent Network Failure (Show Error State)

**Scenario:** All retry attempts fail, error state displayed

**Setup:**
```typescript
// Modify src/utils/contractReadRetry.ts for testing
// Make all attempts fail:

export async function retryContractRead<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // TEST: Always fail
  throw new Error('Test: Persistent network failure');
}
```

**Steps:**
1. Apply test modification
2. Navigate to `/governance` page
3. Observe proposals list

**Expected Result:**

**Proposals List:**
- Proposal card displays red error warning box with:
  - Icon: Red X icon
  - Title: "Unable to determine proposal state"
  - Message: "There was an error fetching the current state from the blockchain..."
- State badge shows "State Unknown" in red
- Proposal details (title, votes, description) still visible
- User can still view proposal information

**Vote Form (when clicked):**
- Shows red error box instead of vote buttons
- Error message: "Cannot verify if this proposal is open for voting. Please try refreshing the page or check back later."
- User cannot vote (safe default)

**Console Output:**
```
[Proposal 1] Retry 1/3 - Failed to fetch state: Test: Persistent network failure
[Proposal 1] Retry 2/3 - Failed to fetch state: Test: Persistent network failure
[Proposal 1] Retry 3/3 - Failed to fetch state: Test: Persistent network failure
[Proposal 1] Failed to fetch state after 3 retries: Error: Test: Persistent network failure
```

---

### Test 4: RPC Rate Limiting

**Scenario:** RPC provider rate limits requests

**Setup:**
- Disable INFURA/Alchemy API key temporarily
- Or use public RPC with strict rate limits

**Steps:**
1. Navigate to `/governance` page
2. Rapidly refresh page multiple times
3. Observe behavior when rate limited

**Expected Result:**
- First few proposals may load successfully
- Rate-limited proposals show error state
- Retry logic attempts 3 times with backoff (500ms, 1000ms, 2000ms)
- After 3.5 seconds total, error state displayed
- User sees clear error message

---

### Test 5: Blockchain Node Downtime

**Scenario:** RPC endpoint is completely unreachable

**Setup:**
- Temporarily change `NEXT_PUBLIC_RPC_URL` to invalid endpoint
- Or disconnect internet connection

**Steps:**
1. Navigate to `/governance` page (may need cached initial data)
2. Try to load proposal states

**Expected Result:**
- Retry logic attempts with increasing delays
- After 3 retries (total ~3.5 seconds), error state shown
- Error message clearly indicates blockchain connection issue
- User can refresh page when connection restored

---

### Test 6: Mixed Success and Failure States

**Scenario:** Some proposals load successfully, others fail

**Setup:**
```typescript
// Modify retry logic to fail randomly:
if (Math.random() > 0.5) {
  throw new Error('Test: Random failure');
}
```

**Steps:**
1. Navigate to `/governance` page
2. Observe multiple proposals

**Expected Result:**
- Successful proposals: Normal state display
- Failed proposals: Error warning and "State Unknown" badge
- Each proposal handles errors independently
- Page remains functional despite partial failures

---

### Test 7: Error State in Voting Flow

**Scenario:** User tries to vote on proposal with unknown state

**Steps:**
1. Load proposal with error state (use Test 3 setup)
2. Click on proposal to open voting modal/form
3. Attempt to vote

**Expected Result:**
- Vote buttons NOT displayed
- Clear error message shown:
  - "Unable to determine proposal state"
  - "Cannot verify if this proposal is open for voting"
  - Suggestion to refresh page
- Voting is prevented (safety measure)
- User is not misled about ability to vote

---

### Test 8: Recovery from Error State

**Scenario:** Error state recovers after page refresh

**Steps:**
1. Load proposal with error state (Test 3)
2. Restore normal configuration
3. Refresh page

**Expected Result:**
- After refresh, proposal state loads successfully
- Error warning disappears
- Correct state badge displayed
- Voting functionality restored (if proposal is active)

---

## Automated Test Checklist

### Unit Tests

```typescript
// Test retry logic
describe('retryContractRead', () => {
  it('should succeed on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue(1);
    const result = await retryContractRead(operation);
    expect(result).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(1);

    const result = await retryContractRead(operation, { retries: 3 });
    expect(result).toBe(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));

    await expect(
      retryContractRead(operation, { retries: 3 })
    ).rejects.toThrow('Persistent error');

    expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should apply exponential backoff', async () => {
    jest.useFakeTimers();
    const operation = jest.fn().mockRejectedValue(new Error('Error'));

    const promise = retryContractRead(operation, {
      retries: 2,
      initialDelay: 500,
      backoffMultiplier: 2
    });

    // First retry: 500ms delay
    await jest.advanceTimersByTime(500);
    // Second retry: 1000ms delay
    await jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow();
    jest.useRealTimers();
  });
});

// Test proposal state handling
describe('useProposals state error handling', () => {
  it('should set state to -1 when fetch fails', async () => {
    // Mock publicClient.readContract to fail
    const mockPublicClient = {
      readContract: jest.fn().mockRejectedValue(new Error('Network error'))
    };

    const proposals = await fetchProposalsOnChain(mockPublicClient);

    expect(proposals[0].state).toBe(-1);
    expect(proposals[0].stateError).toBe(true);
  });

  it('should set state correctly when fetch succeeds', async () => {
    const mockPublicClient = {
      readContract: jest.fn().mockResolvedValue(1) // Active state
    };

    const proposals = await fetchProposalsOnChain(mockPublicClient);

    expect(proposals[0].state).toBe(1);
    expect(proposals[0].stateError).toBe(false);
  });
});
```

---

## Integration Test Checklist

- [ ] Navigate to `/governance` with normal network
- [ ] Verify all proposal states load correctly
- [ ] Verify retry logic logs appear in console on temporary failure
- [ ] Simulate persistent network failure
- [ ] Verify error warnings appear on proposals
- [ ] Verify "State Unknown" badge displays
- [ ] Open proposal with error state
- [ ] Verify voting is disabled with clear error message
- [ ] Refresh page and verify recovery
- [ ] Test with multiple proposals (some succeed, some fail)
- [ ] Verify no console errors beyond expected retry warnings
- [ ] Verify performance (retry delays don't block page rendering)

---

## Regression Tests

### Before Fix (Old Behavior)

**When state fetch failed:**
- ❌ Assumed state = 1 (Active)
- ❌ User saw "Active" badge
- ❌ User could attempt to vote on closed/expired proposals
- ❌ Transaction would fail with confusing error
- ❌ No indication of data fetch issue

### After Fix (New Behavior)

**When state fetch fails:**
- ✅ Shows state = -1 (Unknown)
- ✅ Displays clear error warning
- ✅ User sees "State Unknown" badge
- ✅ Voting is disabled with explanation
- ✅ User knows to refresh or try later
- ✅ No misleading information

---

## Performance Benchmarks

**Retry Timing:**
- First attempt: Immediate
- Retry 1: 500ms delay
- Retry 2: 1000ms delay (2x backoff)
- Retry 3: 2000ms delay (2x backoff)
- **Total max delay: ~3.5 seconds**

**Expected Impact:**
- Normal operation: No delay (first attempt succeeds)
- Temporary failure: 500ms - 1000ms delay (succeeds on retry)
- Persistent failure: 3.5 seconds before showing error
- Multiple proposals: Fetches run in parallel (not sequential)

---

## Test Environment Setup

### Development

```bash
# 1. Start dev server
npm run dev

# 2. Open browser console
# Chrome: F12 → Console
# Firefox: F12 → Console

# 3. Filter console logs
# Search for: "[Proposal"
# This shows retry attempts and state fetch logs

# 4. Test with network throttling
# Chrome DevTools → Network → Throttling → Slow 3G
```

### Production

```bash
# Test with production build
npm run build
npm start

# Verify console.log statements removed (Issue #13)
# Only console.error and console.warn should appear
```

---

## Success Criteria

✅ **Retry Logic:**
- 3 retry attempts with exponential backoff
- Console logs show retry attempts
- Succeeds on transient failures

✅ **Error State Display:**
- "State Unknown" badge in red
- Clear error warning with icon
- Actionable message (refresh/try later)

✅ **Safety:**
- Voting disabled when state unknown
- No false "Active" state displayed
- Users not misled about proposal status

✅ **User Experience:**
- Error messages are clear and actionable
- Page remains functional despite errors
- Proposal details still visible
- Can recover by refreshing page

✅ **Performance:**
- No blocking delays on successful fetches
- Reasonable timeout on failures (3.5s)
- Parallel fetching for multiple proposals

---

**Test Plan Created:** November 25, 2025
**Status:** Ready for Testing
**Estimated Test Time:** 20-30 minutes
