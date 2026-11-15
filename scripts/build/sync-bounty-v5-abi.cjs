/**
 * Copy the compiled BountyManagerV5 artifact's ABI into src/abis/ so the app
 * encodes calls against the exact deployed interface. Run after `npx hardhat compile`.
 *
 * Usage: node scripts/build/sync-bounty-v5-abi.cjs
 */
const fs = require('fs');
const path = require('path');

const artifactPath = path.join(
  __dirname,
  '../../artifacts/src/contracts/BountyManagerV5.sol/BountyManagerV5.json',
);
const outPath = path.join(__dirname, '../../src/abis/BountyManagerV5.json');

if (!fs.existsSync(artifactPath)) {
  console.error('❌ Artifact not found. Run `npx hardhat compile` first:', artifactPath);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
// The app imports `.abi` from this file (see useBountyV2.ts / BidApprovalFlow.tsx),
// so keep the { abi: [...] } shape.
fs.writeFileSync(outPath, JSON.stringify({ abi: artifact.abi }, null, 2) + '\n');
console.log('✅ Wrote', outPath, `(${artifact.abi.length} ABI entries)`);
