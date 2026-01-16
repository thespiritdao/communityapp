/**
 * Script to update pod with treasury address
 * Usage: node scripts/update-pod-treasury.mjs <podId> <treasuryAddress>
 */

const podId = process.argv[2] || '96760362-c7d1-499c-97b0-359333caf228';
const treasuryAddress = process.argv[3] || '0xf3C8379945b2B5d784eC532A32686974f05Cf372';

console.log('📝 Updating pod with treasury address...');
console.log('Pod ID:', podId);
console.log('Treasury Address:', treasuryAddress);

try {
  const response = await fetch('http://localhost:3000/api/pods/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      podId: podId,
      treasuryAddress: treasuryAddress,
      isActive: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update pod: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('\n✅ Successfully updated pod!');
  console.log('Result:', result);
} catch (error) {
  console.error('❌ Error updating pod:', error.message);
  process.exit(1);
}
