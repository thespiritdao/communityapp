# Logging Best Practices - SpiritDAO

**Date:** November 25, 2025
**Related Issue:** #13 - Console Logging in Production

---

## 🎯 Overview

This guide outlines best practices for logging in the SpiritDAO application, ensuring secure, performant, and useful logging across development and production environments.

---

## ⚙️ Configuration Summary

### Production Console Removal

**File:** `next.config.mjs`

```javascript
compiler: {
  removeConsole: process.env.NODE_ENV === 'production'
    ? {
        exclude: ['error'], // Keep console.error for production error tracking
      }
    : false,
}
```

**Result:**
- ✅ `console.log` - **REMOVED** in production
- ✅ `console.warn` - **REMOVED** in production
- ✅ `console.debug` - **REMOVED** in production
- ✅ `console.info` - **REMOVED** in production
- ✅ `console.error` - **PRESERVED** in production (critical errors only)

### Logger Configuration

**File:** `src/utils/logger.ts`

**Features:**
- Environment-aware logging levels
- Automatic sensitive data redaction
- Message debouncing (production)
- Grouped logs for related operations
- Performance timing

---

## 📖 Usage Guide

### 1. Import the Logger

```typescript
import { logger, logInfo, logError, logDebug, logWarn } from '@/utils/logger';

// Or for convenience exports
import { logger } from '@/utils/logger';
```

### 2. Use Appropriate Log Levels

#### DEBUG - Development-only verbose logs
```typescript
import { logDebug } from '@/utils/logger';

logDebug('Fetching user profile', { userId: '123' });
logDebug('Cache hit', { key: 'user:123', ttl: 3600 });
```

**When to use:**
- Detailed function execution flow
- Cache hits/misses
- State changes during development
- Variable values for debugging

**Environment:** Development only (filtered out in production)

---

#### INFO - Important milestones
```typescript
import { logInfo } from '@/utils/logger';

logInfo('User authenticated', { address: user.address });
logInfo('Proposal created', { proposalId, podId });
logInfo('Treasury distribution executed', { amount, recipients });
```

**When to use:**
- Successful authentication
- Important state changes
- Completed operations
- Feature usage tracking

**Environment:** Development and production (filtered in production)

---

#### WARN - Non-critical issues
```typescript
import { logWarn } from '@/utils/logger';

logWarn('Slow network response', { endpoint: '/api/proposals', latency: 3500 });
logWarn('Deprecated API usage', { feature: 'oldGetBalance', replacement: 'newGetBalance' });
logWarn('Rate limit approaching', { remaining: 5, limit: 100 });
```

**When to use:**
- Deprecated feature usage
- Performance issues
- Rate limiting warnings
- Recoverable errors

**Environment:** Development and production

---

#### ERROR - Critical failures
```typescript
import { logError } from '@/utils/logger';

logError('Failed to create proposal', { error: error.message, proposalData });
logError('Smart contract call failed', {
  contract: 'PodTreasury',
  function: 'distribute',
  error: error.message
});
```

**When to use:**
- Smart contract failures
- Network errors
- Database errors
- Critical business logic failures
- Unhandled exceptions

**Environment:** Development and production (always shown)

---

#### SUCCESS - Positive outcomes
```typescript
import { logger } from '@/utils/logger';

logger.success('Pod created successfully', { podId, podName });
logger.success('NFT minted', { tokenId, recipient });
```

**When to use:**
- Successful transactions
- Completed workflows
- User achievements

**Environment:** Development and production

---

### 3. Grouped Logs

For related operations, use `group()` and `groupEnd()`:

```typescript
import { logger } from '@/utils/logger';

logger.group('Pod Creation Flow');
logger.info('Validating pod parameters');
logger.debug('Pod data', podData);
logger.info('Creating on-chain pod');
logger.info('Deploying treasury contract');
logger.success('Pod created successfully');
logger.groupEnd();
```

**Output in console:**
```
📦 Pod Creation Flow
  ✅ Validating pod parameters
  🔍 Pod data { name: "Dev Pod", ... }
  ✅ Creating on-chain pod
  ✅ Deploying treasury contract
  🎉 Pod created successfully
```

---

### 4. Performance Timing

Measure execution time of operations:

```typescript
import { logger } from '@/utils/logger';

logger.time('Fetch proposals');
await fetchProposals();
logger.timeEnd('Fetch proposals');
// Output: ⏱️ Fetch proposals: 245ms
```

---

### 5. One-time Logs

For deprecation warnings or notices that should appear only once:

```typescript
import { logger } from '@/utils/logger';

logger.once('warn', 'This feature is deprecated. Use newFeature() instead.');
```

**Use case:** Deprecation warnings, migration notices

---

## 🔒 Sensitive Data Protection

### Automatic Redaction

The logger **automatically redacts** sensitive data based on key names and patterns.

#### Protected Keys
```typescript
const SENSITIVE_KEYS = [
  'privateKey', 'private_key',
  'secretKey', 'secret_key',
  'password', 'pwd',
  'apiKey', 'api_key',
  'token', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token',
  'mnemonic', 'seed', 'signature',
  'auth', 'authorization',
  'cookie', 'session', 'jwt', 'bearer',
];
```

#### Example Redaction

**Input:**
```typescript
logInfo('User logged in', {
  address: '0x1234...5678',
  accessToken: 'sk_live_abc123xyz789',
  username: 'alice'
});
```

**Output:**
```
✅ User logged in {
  address: '0x1234...5678',
  accessToken: '[REDACTED:sk_l...8789]',
  username: 'alice'
}
```

**Note:** Partial values shown for debugging while protecting sensitive content.

---

## ❌ What NOT to Log

### Never Log These Directly

```typescript
// ❌ BAD - Exposing sensitive data
console.log('Private key:', privateKey);
console.log('User password:', password);
console.log('API secret:', process.env.API_SECRET);

// ✅ GOOD - Use logger with automatic redaction
logDebug('Auth data', { privateKey, apiKey }); // Automatically redacted

// ✅ BETTER - Don't log sensitive data at all
logDebug('Auth successful'); // No sensitive data included
```

### Avoid Logging Large Objects

```typescript
// ❌ BAD - Logging entire state tree
console.log('Redux state:', store.getState());

// ✅ GOOD - Log specific values
logDebug('Current user', { userId: state.user.id });
```

### Don't Log in Loops

```typescript
// ❌ BAD - Spams console
proposals.forEach(proposal => {
  console.log('Processing proposal', proposal.id);
});

// ✅ GOOD - Log summary
logInfo('Processing proposals', { count: proposals.length });
proposals.forEach(processProposal);
logSuccess('Proposals processed');
```

---

## 🧪 Testing Console Removal

### Build and Test

```bash
# 1. Build production
npm run build

# 2. Run test script
node test-console-removal.js
```

### Expected Output

```
✅ TEST PASSED: Console removal working correctly!

Summary:
   • console.log/warn/debug/info: Removed ✅
   • console.error: Preserved ✅

🎉 Production build is properly configured!
```

---

## 📝 Migration Guide

### Migrating from console.* to logger

#### Before
```typescript
console.log('User authenticated:', user);
console.warn('Slow network detected');
console.error('Failed to fetch:', error);
```

#### After
```typescript
import { logInfo, logWarn, logError } from '@/utils/logger';

logInfo('User authenticated', { address: user.address });
logWarn('Slow network detected');
logError('Failed to fetch', { error: error.message });
```

### Quick Replace Patterns

```bash
# Find all console.log statements
grep -r "console\.log" src/

# Example replacements:
console.log(...) → logDebug(...) or logInfo(...)
console.warn(...) → logWarn(...)
console.error(...) → logError(...)
console.info(...) → logInfo(...)
```

---

## 🎯 Log Level Guidelines

### Development Environment

```
┌─────────────────────────────────────────┐
│ All Logs Visible                        │
├─────────────────────────────────────────┤
│ DEBUG   - Verbose development logs      │
│ INFO    - Important milestones          │
│ WARN    - Non-critical issues           │
│ ERROR   - Critical failures             │
└─────────────────────────────────────────┘
```

**Setting:** `logger.config.level = 'debug'`

### Production Environment

```
┌─────────────────────────────────────────┐
│ Limited Logs for Performance            │
├─────────────────────────────────────────┤
│ DEBUG   - Not shown (compiled out)      │
│ INFO    - Important only (debounced)    │
│ WARN    - Shown (debounced)             │
│ ERROR   - Always shown (critical)       │
└─────────────────────────────────────────┘
```

**Setting:** `logger.config.level = 'info'`

### Test Environment

```
┌─────────────────────────────────────────┐
│ Minimal Logs (Errors Only)              │
├─────────────────────────────────────────┤
│ DEBUG   - Not shown                     │
│ INFO    - Not shown                     │
│ WARN    - Not shown                     │
│ ERROR   - Shown (tests should catch)    │
└─────────────────────────────────────────┘
```

**Setting:** `logger.config.level = 'error'`

---

## 🔧 Advanced Configuration

### Custom Logger Instance

For feature-specific logging with custom configuration:

```typescript
import { Logger } from '@/utils/logger';

const podLogger = new Logger({
  level: 'debug',
  enableDebounce: false,
  debounceMs: 5000,
  redactSensitiveData: true,
});

podLogger.info('Pod operation', { podId });
```

### Disable Redaction (Development Only)

```typescript
const devLogger = new Logger({
  redactSensitiveData: false, // Only for local debugging
});
```

**⚠️ Warning:** Never deploy with redaction disabled!

---

## 🚨 Common Mistakes

### 1. Using console.log Directly

```typescript
// ❌ WRONG
console.log('User logged in:', user);

// ✅ CORRECT
logInfo('User logged in', { address: user.address });
```

### 2. Logging in Render Functions

```typescript
// ❌ WRONG - Logs on every render
function MyComponent() {
  console.log('Rendering MyComponent');
  return <div>Hello</div>;
}

// ✅ CORRECT - Log meaningful events
function MyComponent() {
  useEffect(() => {
    logDebug('MyComponent mounted');
    return () => logDebug('MyComponent unmounted');
  }, []);

  return <div>Hello</div>;
}
```

### 3. Logging Entire Objects

```typescript
// ❌ WRONG - Too much data
logInfo('Proposal data', proposal); // Contains 50+ fields

// ✅ CORRECT - Log relevant fields
logInfo('Proposal created', {
  id: proposal.id,
  title: proposal.title,
  creator: proposal.creator
});
```

### 4. Not Using Log Levels Correctly

```typescript
// ❌ WRONG - Everything as info
logInfo('Starting function');
logInfo('Fetching data');
logInfo('Processing result');
logInfo('Done');

// ✅ CORRECT - Use appropriate levels
logDebug('Starting function'); // Development detail
logInfo('Processing proposal', { id }); // Important milestone
logSuccess('Proposal processed'); // Successful outcome
```

---

## 📊 Performance Impact

### Development
- **Overhead:** Minimal (~0.1ms per log)
- **Debouncing:** Disabled (see all logs)
- **Redaction:** Enabled (always protect data)

### Production
- **Overhead:** None (console.log removed by compiler)
- **Debouncing:** Enabled (5000ms - prevent spam)
- **Redaction:** Enabled (always protect data)

**Note:** console.error preserved for critical error tracking in production.

---

## 🎓 Examples by Feature

### Authentication

```typescript
import { logInfo, logError, logDebug } from '@/utils/logger';

async function authenticateUser(signature: string) {
  logDebug('Verifying signature'); // Dev only

  try {
    const user = await verifySignature(signature);
    logInfo('User authenticated', { address: user.address }); // Production
    return user;
  } catch (error) {
    logError('Authentication failed', { error: error.message }); // Always shown
    throw error;
  }
}
```

### Smart Contract Calls

```typescript
import { logger } from '@/utils/logger';

async function createPod(podData: PodData) {
  logger.group('Pod Creation');

  logger.info('Validating pod data');
  validatePodData(podData);

  logger.info('Deploying pod contract', { name: podData.name });

  try {
    const tx = await podFactory.createPod(podData);
    logger.info('Transaction sent', { hash: tx.hash });

    await tx.wait();
    logger.success('Pod created successfully', { podId: tx.podId });

  } catch (error) {
    logger.error('Pod creation failed', {
      error: error.message,
      podName: podData.name
    });
    throw error;
  } finally {
    logger.groupEnd();
  }
}
```

### API Calls

```typescript
import { logger } from '@/utils/logger';

async function fetchProposals() {
  logger.time('Fetch proposals');

  try {
    const response = await fetch('/api/proposals');

    if (!response.ok) {
      logger.warn('API returned error', {
        status: response.status,
        statusText: response.statusText
      });
    }

    const proposals = await response.json();
    logger.info('Proposals fetched', { count: proposals.length });

    return proposals;

  } catch (error) {
    logger.error('Failed to fetch proposals', { error: error.message });
    throw error;
  } finally {
    logger.timeEnd('Fetch proposals');
  }
}
```

---

## 📚 References

### Related Files
- **Logger Implementation:** `src/utils/logger.ts`
- **Next.js Config:** `next.config.mjs`
- **Test Script:** `test-console-removal.js`
- **Issue Documentation:** `ISSUE_13_CONSOLE_LOGGING_COMPLETE.md`

### Related Issues
- **Issue #8:** CSP Security ✅
- **Issue #12:** Error Boundaries ✅
- **Issue #13:** Console Logging ✅ (This Issue)

---

## ✅ Checklist for Developers

When adding new logging to the codebase:

- [ ] Use `logger` utilities instead of `console.*`
- [ ] Choose appropriate log level (debug/info/warn/error)
- [ ] Avoid logging sensitive data directly
- [ ] Log relevant context (IDs, names) not entire objects
- [ ] Use grouped logs for multi-step operations
- [ ] Add performance timing for slow operations
- [ ] Test logging in both development and production builds
- [ ] Verify sensitive data is automatically redacted
- [ ] Remove temporary debug logs before committing

---

## 🎉 Summary

**Best Practices:**
1. ✅ Use `logger` utilities, not `console.*`
2. ✅ Choose appropriate log levels
3. ✅ Let automatic redaction protect sensitive data
4. ✅ Log context, not entire objects
5. ✅ Test production builds with test script
6. ✅ Keep logs concise and meaningful

**Result:**
- Secure logging (no data leaks)
- Performant production builds
- Useful development debugging
- Consistent logging patterns

---

**Generated:** November 25, 2025
**Issue:** #13 - Console Logging in Production
**Status:** Production Ready ✅
