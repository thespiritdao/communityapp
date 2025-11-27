/**
 * Test Script: Console Removal in Production Builds
 *
 * This script verifies that console.log statements are removed in production
 * while console.error statements are preserved.
 *
 * Usage:
 * 1. Build production: npm run build
 * 2. Run this test: node test-console-removal.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing console removal in production build...\n');

// Check if .next build directory exists
const buildDir = path.join(__dirname, '.next');
if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found. Run "npm run build" first.');
  process.exit(1);
}

console.log('✅ Build directory found\n');

/**
 * Search for console statements in built files
 */
function searchConsoleStatements(dir, filePattern = /\.js$/) {
  const results = {
    consoleLog: [],
    consoleError: [],
    consoleWarn: [],
    consoleDebug: [],
    consoleInfo: [],
  };

  function walk(directory) {
    const files = fs.readdirSync(directory);

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Skip certain directories
        if (file === 'cache' || file === 'node_modules') continue;
        walk(filePath);
      } else if (filePattern.test(file)) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for various console methods
        // Use regex that finds actual console calls, not just the word "console"
        const logMatches = content.match(/console\.log\(/g);
        const errorMatches = content.match(/console\.error\(/g);
        const warnMatches = content.match(/console\.warn\(/g);
        const debugMatches = content.match(/console\.debug\(/g);
        const infoMatches = content.match(/console\.info\(/g);

        if (logMatches) {
          results.consoleLog.push({
            file: path.relative(buildDir, filePath),
            count: logMatches.length,
          });
        }
        if (errorMatches) {
          results.consoleError.push({
            file: path.relative(buildDir, filePath),
            count: errorMatches.length,
          });
        }
        if (warnMatches) {
          results.consoleWarn.push({
            file: path.relative(buildDir, filePath),
            count: warnMatches.length,
          });
        }
        if (debugMatches) {
          results.consoleDebug.push({
            file: path.relative(buildDir, filePath),
            count: debugMatches.length,
          });
        }
        if (infoMatches) {
          results.consoleInfo.push({
            file: path.relative(buildDir, filePath),
            count: infoMatches.length,
          });
        }
      }
    }
  }

  walk(dir);
  return results;
}

console.log('📊 Analyzing build output...\n');

const results = searchConsoleStatements(buildDir);

// Display results
console.log('='.repeat(60));
console.log('CONSOLE REMOVAL TEST RESULTS');
console.log('='.repeat(60));
console.log();

// console.log (should be REMOVED in production)
console.log('📝 console.log statements:');
if (results.consoleLog.length === 0) {
  console.log('   ✅ PASS: No console.log statements found (correctly removed)');
} else {
  console.log('   ⚠️  FAIL: Found console.log statements in production build:');
  results.consoleLog.forEach(({ file, count }) => {
    console.log(`      - ${file}: ${count} occurrences`);
  });
}
console.log();

// console.warn (should be REMOVED in production)
console.log('⚠️  console.warn statements:');
if (results.consoleWarn.length === 0) {
  console.log('   ✅ PASS: No console.warn statements found (correctly removed)');
} else {
  console.log('   ⚠️  FAIL: Found console.warn statements in production build:');
  results.consoleWarn.forEach(({ file, count }) => {
    console.log(`      - ${file}: ${count} occurrences`);
  });
}
console.log();

// console.debug (should be REMOVED in production)
console.log('🔍 console.debug statements:');
if (results.consoleDebug.length === 0) {
  console.log('   ✅ PASS: No console.debug statements found (correctly removed)');
} else {
  console.log('   ⚠️  FAIL: Found console.debug statements in production build:');
  results.consoleDebug.forEach(({ file, count }) => {
    console.log(`      - ${file}: ${count} occurrences`);
  });
}
console.log();

// console.info (should be REMOVED in production)
console.log('ℹ️  console.info statements:');
if (results.consoleInfo.length === 0) {
  console.log('   ✅ PASS: No console.info statements found (correctly removed)');
} else {
  console.log('   ⚠️  FAIL: Found console.info statements in production build:');
  results.consoleInfo.forEach(({ file, count }) => {
    console.log(`      - ${file}: ${count} occurrences`);
  });
}
console.log();

// console.error (should be PRESERVED in production)
console.log('❌ console.error statements:');
if (results.consoleError.length > 0) {
  console.log('   ✅ PASS: console.error statements preserved (correct):');
  const totalErrors = results.consoleError.reduce((sum, { count }) => sum + count, 0);
  console.log(`      Total: ${totalErrors} occurrences across ${results.consoleError.length} files`);
} else {
  console.log('   ℹ️  INFO: No console.error statements found');
}
console.log();

console.log('='.repeat(60));
console.log();

// Final summary
const hasFailures =
  results.consoleLog.length > 0 ||
  results.consoleWarn.length > 0 ||
  results.consoleDebug.length > 0 ||
  results.consoleInfo.length > 0;

if (hasFailures) {
  console.log('❌ TEST FAILED: Some console statements were not removed');
  console.log();
  console.log('💡 TROUBLESHOOTING:');
  console.log('   1. Verify NODE_ENV=production during build');
  console.log('   2. Check next.config.mjs has removeConsole configuration');
  console.log('   3. Clear .next directory and rebuild: rm -rf .next && npm run build');
  console.log('   4. Ensure you\'re using Next.js 12.1 or higher (SWC compiler required)');
  process.exit(1);
} else {
  console.log('✅ TEST PASSED: Console removal working correctly!');
  console.log();
  console.log('Summary:');
  console.log('   • console.log/warn/debug/info: Removed ✅');
  console.log('   • console.error: Preserved ✅');
  console.log();
  console.log('🎉 Production build is properly configured!');
  process.exit(0);
}
