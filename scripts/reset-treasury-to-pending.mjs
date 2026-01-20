/**
 * Script to reset pod treasury to 'pending' for tutorial recording
 * Usage: node scripts/reset-treasury-to-pending.mjs <podId>
 *
 * WARNING: The treasury contract still exists on-chain!
 * Attempting to deploy again will trigger "Treasury already exists" error,
 * but automatic recovery will restore the link.
 */

const podId = process.argv[2] || 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

console.log('🔄 Resetting treasury to pending for tutorial recording...');
console.log('Pod ID:', podId);
console.log('');
console.log('⚠️  WARNING: This only resets the DATABASE link!');
console.log('The treasury contract still exists on-chain and cannot be undeployed.');
console.log('');

try {
  // Use the activate API to reset to pending
  const response = await fetch('http://localhost:3000/api/pods/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      podId: podId,
      treasuryAddress: 'pending', // Reset to pending
      isActive: false, // Mark as not active
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to reset: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  console.log('✅ Database reset to pending!');
  console.log('Pod:', result.pod?.name);
  console.log('Treasury status:', result.pod?.treasury_contract_address);
  console.log('');
  console.log('📹 Tutorial Recording Options:');
  console.log('');
  console.log('Option A - Show Recovery Flow (Recommended):');
  console.log('  1. Click "Deploy Treasury"');
  console.log('  2. Transaction will fail with "already exists"');
  console.log('  3. Automatic recovery kicks in');
  console.log('  4. Shows "Treasury Recovered!" message');
  console.log('  → Demonstrates app resilience!');
  console.log('');
  console.log('Option B - Clean Demo:');
  console.log('  Create a new pod for a truly fresh deployment demo');
  console.log('  (The on-chain contract cannot be undeployed)');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
