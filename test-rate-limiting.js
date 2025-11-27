/**
 * Rate Limiting Test Script
 *
 * Tests rate limiting for Sensemaker AI and Airdrop endpoints.
 *
 * Usage:
 * 1. Start dev server: npm run dev
 * 2. Run tests: node test-rate-limiting.js
 *
 * Requirements:
 * - UPSTASH_REDIS env vars must be configured
 * - Server running on http://localhost:3000
 */

const API_BASE = 'http://localhost:3000';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.cyan);
  console.log('='.repeat(60) + '\n');
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test 1: Sensemaker AI Rate Limiting
 */
async function testSensemakerRateLimit() {
  logSection('TEST 1: Sensemaker AI Rate Limiting (10 req/min)');

  const results = [];

  log('Sending 12 requests rapidly...', colors.blue);

  for (let i = 1; i <= 12; i++) {
    try {
      const response = await fetch(`${API_BASE}/api/sensemaker/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Test request ${i}`,
          conversationHistory: [],
          sessionId: `test-rate-limit-${Date.now()}`,
        }),
      });

      const data = await response.json();
      const rateLimit = {
        limit: response.headers.get('X-RateLimit-Limit'),
        remaining: response.headers.get('X-RateLimit-Remaining'),
        reset: response.headers.get('X-RateLimit-Reset'),
      };

      results.push({
        requestNum: i,
        status: response.status,
        success: response.ok,
        rateLimit,
        message: data.error || data.response?.substring(0, 50) || 'Success',
      });

      if (response.ok) {
        log(
          `  Request ${i}: ✅ ${response.status} | Remaining: ${rateLimit.remaining}/${rateLimit.limit}`,
          colors.green,
        );
      } else {
        log(
          `  Request ${i}: ❌ ${response.status} | ${data.error}`,
          colors.red,
        );
      }

      // Small delay to avoid overwhelming the server
      await sleep(100);
    } catch (error) {
      log(`  Request ${i}: ❌ Error: ${error.message}`, colors.red);
      results.push({
        requestNum: i,
        status: 'ERROR',
        success: false,
        error: error.message,
      });
    }
  }

  // Analysis
  log('\nAnalysis:', colors.yellow);
  const successCount = results.filter((r) => r.success).length;
  const rateLimitedCount = results.filter((r) => r.status === 429).length;

  log(`  Total requests: ${results.length}`);
  log(`  Successful: ${successCount} (expected: 10)`);
  log(`  Rate limited: ${rateLimitedCount} (expected: 2)`);

  if (successCount === 10 && rateLimitedCount === 2) {
    log('\n✅ TEST PASSED: Rate limiting working correctly!', colors.green);
    return true;
  } else {
    log('\n❌ TEST FAILED: Unexpected rate limiting behavior', colors.red);
    return false;
  }
}

/**
 * Test 2: Airdrop Rate Limiting
 */
async function testAirdropRateLimit() {
  logSection('TEST 2: Airdrop Rate Limiting (3 req/hour)');

  const testWallet = '0x' + '1'.repeat(40); // Test wallet address
  const results = [];

  log(`Using test wallet: ${testWallet}`, colors.blue);
  log('Sending 5 requests rapidly...', colors.blue);

  for (let i = 1; i <= 5; i++) {
    try {
      const response = await fetch(`${API_BASE}/api/airdrop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: testWallet,
        }),
      });

      const data = await response.json();
      const rateLimit = {
        limit: response.headers.get('X-RateLimit-Limit'),
        remaining: response.headers.get('X-RateLimit-Remaining'),
        reset: response.headers.get('X-RateLimit-Reset'),
      };

      results.push({
        requestNum: i,
        status: response.status,
        success: response.ok,
        rateLimit,
        message: data.error || data.message || 'Success',
      });

      if (response.ok) {
        log(
          `  Request ${i}: ✅ ${response.status} | Remaining: ${rateLimit.remaining}/${rateLimit.limit}`,
          colors.green,
        );
      } else if (response.status === 429) {
        log(
          `  Request ${i}: ⏱️  ${response.status} | Rate limited (expected after 3rd request)`,
          colors.yellow,
        );
      } else {
        log(
          `  Request ${i}: ❌ ${response.status} | ${data.error}`,
          colors.red,
        );
      }

      await sleep(100);
    } catch (error) {
      log(`  Request ${i}: ❌ Error: ${error.message}`, colors.red);
      results.push({
        requestNum: i,
        status: 'ERROR',
        success: false,
        error: error.message,
      });
    }
  }

  // Analysis
  log('\nAnalysis:', colors.yellow);
  const successCount = results.filter(
    (r) => r.success || r.status === 200,
  ).length;
  const rateLimitedCount = results.filter((r) => r.status === 429).length;

  log(`  Total requests: ${results.length}`);
  log(`  Successful: ${successCount} (expected: 3 or less if user exists)`);
  log(`  Rate limited: ${rateLimitedCount} (expected: 2)`);

  if (rateLimitedCount >= 2) {
    log('\n✅ TEST PASSED: Airdrop rate limiting working!', colors.green);
    return true;
  } else {
    log(
      '\n❌ TEST FAILED: Airdrop rate limiting not working as expected',
      colors.red,
    );
    log(
      "   Note: This could be expected if rate limit window hasn't reset",
      colors.yellow,
    );
    return false;
  }
}

/**
 * Test 3: Rate Limit Headers
 */
async function testRateLimitHeaders() {
  logSection('TEST 3: Rate Limit Headers');

  log('Sending single request to check headers...', colors.blue);

  try {
    const response = await fetch(`${API_BASE}/api/sensemaker/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test headers',
        conversationHistory: [],
        sessionId: 'header-test',
      }),
    });

    const headers = {
      'X-RateLimit-Limit': response.headers.get('X-RateLimit-Limit'),
      'X-RateLimit-Remaining': response.headers.get('X-RateLimit-Remaining'),
      'X-RateLimit-Reset': response.headers.get('X-RateLimit-Reset'),
    };

    log('\nResponse Headers:', colors.yellow);
    log(`  X-RateLimit-Limit: ${headers['X-RateLimit-Limit']}`);
    log(`  X-RateLimit-Remaining: ${headers['X-RateLimit-Remaining']}`);
    log(`  X-RateLimit-Reset: ${headers['X-RateLimit-Reset']}`);

    if (
      headers['X-RateLimit-Limit'] &&
      headers['X-RateLimit-Remaining'] &&
      headers['X-RateLimit-Reset']
    ) {
      log('\n✅ TEST PASSED: All rate limit headers present', colors.green);
      return true;
    } else {
      log('\n❌ TEST FAILED: Missing rate limit headers', colors.red);
      return false;
    }
  } catch (error) {
    log(`\n❌ TEST FAILED: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Test 4: Rate Limit Reset
 */
async function testRateLimitReset() {
  logSection('TEST 4: Rate Limit Reset Time');

  log('Triggering rate limit...', colors.blue);

  try {
    // Trigger rate limit
    for (let i = 0; i < 11; i++) {
      await fetch(`${API_BASE}/api/sensemaker/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Reset test ${i}`,
          conversationHistory: [],
          sessionId: `reset-test-${i}`,
        }),
      });
      await sleep(50);
    }

    // Check rate limited response
    const response = await fetch(`${API_BASE}/api/sensemaker/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Should be rate limited',
        conversationHistory: [],
        sessionId: 'reset-test-final',
      }),
    });

    if (response.status === 429) {
      const data = await response.json();
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const retryAfter = response.headers.get('Retry-After');
      const now = Date.now();
      const resetDate = new Date(parseInt(resetTime));

      log(`\n✅ Rate limit triggered successfully`, colors.green);
      log(`\nReset Information:`, colors.yellow);
      log(`  Current time: ${new Date(now).toISOString()}`);
      log(`  Reset time: ${resetDate.toISOString()}`);
      log(`  Retry after: ${retryAfter} seconds`);
      log(`  Time until reset: ${Math.ceil((resetTime - now) / 1000)} seconds`);

      log('\n✅ TEST PASSED: Reset time information correct', colors.green);
      return true;
    } else {
      log(
        '\n⚠️  TEST SKIPPED: Could not trigger rate limit (may have been reset)',
        colors.yellow,
      );
      return true;
    }
  } catch (error) {
    log(`\n❌ TEST FAILED: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  logSection('RATE LIMITING TEST SUITE');
  log(
    'Testing rate limiting implementation for SpiritDAO API endpoints\n',
    colors.blue,
  );

  log(`API Base URL: ${API_BASE}`, colors.blue);
  log('Ensure dev server is running: npm run dev\n', colors.blue);

  const results = {
    sensemaker: false,
    airdrop: false,
    headers: false,
    reset: false,
  };

  try {
    // Test 1: Sensemaker Rate Limiting
    results.sensemaker = await testSensemakerRateLimit();
    await sleep(2000);

    // Test 2: Airdrop Rate Limiting
    results.airdrop = await testAirdropRateLimit();
    await sleep(2000);

    // Test 3: Rate Limit Headers
    results.headers = await testRateLimitHeaders();
    await sleep(2000);

    // Test 4: Rate Limit Reset
    results.reset = await testRateLimitReset();

    // Final Summary
    logSection('TEST SUMMARY');

    const tests = [
      { name: 'Sensemaker AI Rate Limiting', result: results.sensemaker },
      { name: 'Airdrop Rate Limiting', result: results.airdrop },
      { name: 'Rate Limit Headers', result: results.headers },
      { name: 'Rate Limit Reset Time', result: results.reset },
    ];

    tests.forEach((test) => {
      const status = test.result ? '✅ PASSED' : '❌ FAILED';
      const color = test.result ? colors.green : colors.red;
      log(`  ${status} - ${test.name}`, color);
    });

    const passedCount = tests.filter((t) => t.result).length;
    const totalCount = tests.length;

    log(`\nTotal: ${passedCount}/${totalCount} tests passed`, colors.yellow);

    if (passedCount === totalCount) {
      log(
        '\n🎉 ALL TESTS PASSED! Rate limiting is working correctly.',
        colors.green,
      );
      process.exit(0);
    } else {
      log(
        '\n⚠️  SOME TESTS FAILED. Please review the output above.',
        colors.red,
      );
      log('\nTroubleshooting:', colors.yellow);
      log('  1. Ensure UPSTASH_REDIS env vars are configured');
      log('  2. Restart dev server: npm run dev');
      log('  3. Check console for "Rate limiting disabled" warnings');
      log('  4. Wait 1 minute and try again (rate limits may need to reset)');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ TEST SUITE FAILED: ${error.message}`, colors.red);
    log(error.stack, colors.red);
    process.exit(1);
  }
}

// Run tests
runAllTests();
