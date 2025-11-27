# Contract Verification Guide - BaseScan

**Date:** November 23, 2025
**Network:** Base Mainnet (Chain ID: 8453)
**Purpose:** Verify all deployed smart contracts for transparency and trust

---

## 📋 WHY VERIFY CONTRACTS?

**Benefits**:
- ✅ **Transparency** - Users can see exactly what code is running
- ✅ **Trust** - Builds confidence in your platform
- ✅ **Security** - Community can audit the code
- ✅ **Debugging** - Easier to debug on-chain issues
- ✅ **Integration** - Third-party tools can interact correctly
- ✅ **Professional** - Standard practice for production dapps

**Risk of Not Verifying**: 🔴 HIGH
- Users cannot verify contract behavior
- Appears unprofessional or suspicious
- Harder to debug production issues
- Reduced trust and adoption

---

## 🎯 CONTRACTS TO VERIFY

### Priority 1: Core Infrastructure (Critical)

#### 1. Pod Factory V2
```bash
Contract: PodFactoryV2 / PodFactoryV2_Minimal
Address: [NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS from .env]
File: src/contracts/PodFactoryV2_Minimal.sol
Constructor Args:
  - _hatsContract: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
```

#### 2. Pod Manager V2
```bash
Contract: PodManagerV2 / PodManagerV2_Minimal
Address: [NEXT_PUBLIC_POD_MANAGER_V2_ADDRESS from .env]
File: src/contracts/PodManagerV2_Minimal.sol
Constructor Args:
  - _factoryContract: [Address from #1 above]
  - _hatsContract: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
```

#### 3. Treasury Proxy
```bash
Contract: TreasuryProxy
Address: [NEXT_PUBLIC_TREASURY_PROXY from .env]
File: src/contracts/TreasuryProxy.sol
Constructor Args:
  - _treasuryFactory: [Address of PodTreasuryFactory]
```

#### 4. Pod Treasury Factory
```bash
Contract: PodTreasuryFactory
Address: [NEXT_PUBLIC_POD_TREASURY_FACTORY from .env]
File: src/contracts/PodTreasuryFactory.sol
Constructor Args:
  - _hatsContract: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
  - _defaultSupportedTokens: [array of SYSTEM, SELF token addresses]
  - _owner: [Your deployer address]
  - _authorizedProxy: [Treasury Proxy address from #3]
```

### Priority 2: Event System (High)

#### 5. Event System Factory
```bash
Contract: EventSystemFactory
Address: [NEXT_PUBLIC_EVENT_SYSTEM_FACTORY from .env]
File: src/contracts/EventSystemFactory.sol
Constructor Args: [Check deployment script]
```

#### 6. Event Escrow
```bash
Contract: EventEscrow
Address: [NEXT_PUBLIC_EVENT_ESCROW_CONTRACT from .env]
File: src/contracts/EventEscrow.sol
Constructor Args: [Check deployment script]
```

#### 7. Event Registration NFT Factory
```bash
Contract: EventRegistrationNFTFactory
Address: [NEXT_PUBLIC_EVENT_REGISTRATION_FACTORY from .env]
File: src/contracts/EventRegistrationNFTFactory_v5.sol
Constructor Args: [Check deployment script]
```

#### 8. Event Completion NFT Factory
```bash
Contract: EventCompletionNFTFactory
Address: [NEXT_PUBLIC_EVENT_COMPLETION_FACTORY from .env]
File: src/contracts/EventCompletionNFTFactory_v5.sol
Constructor Args: [Check deployment script]
```

### Priority 3: Bounty System (Medium)

#### 9. Bounty Manager V2
```bash
Contract: BountyManagerV2
Address: 0x29e653502083442B8B6C7c969557022F6a3CC64C (from .env)
File: src/contracts/BountyManagerV2.sol
Constructor Args:
  - _podServiceContract: [Address of PodBountyService if deployed]
```

#### 10. Pod Bounty Service (if deployed)
```bash
Contract: PodBountyService
Address: [NEXT_PUBLIC_POD_BOUNTY_SERVICE from .env if set]
File: src/contracts/PodBountyService.sol
Constructor Args: [Check deployment script]
```

---

## 🔧 VERIFICATION METHODS

### Method 1: Hardhat (Recommended)

**Prerequisites**:
```bash
npm install --save-dev @nomiclabs/hardhat-etherscan
```

**hardhat.config.ts**:
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20", // Match your contract version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    base: {
      url: "https://mainnet.base.org",
      accounts: [process.env.PRIVATE_KEY!],
      chainId: 8453
    }
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY!
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      }
    ]
  }
};

export default config;
```

**Verification Command**:
```bash
npx hardhat verify --network base CONTRACT_ADDRESS "CONSTRUCTOR_ARG_1" "CONSTRUCTOR_ARG_2"
```

**Example - Pod Factory**:
```bash
npx hardhat verify --network base \
  0xYOUR_FACTORY_ADDRESS \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137"
```

**Example - Pod Manager**:
```bash
npx hardhat verify --network base \
  0xYOUR_MANAGER_ADDRESS \
  "0xYOUR_FACTORY_ADDRESS" \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137"
```

**Example - Treasury Factory**:
```bash
npx hardhat verify --network base \
  0xYOUR_TREASURY_FACTORY \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137" \
  '["0xSYSTEM_TOKEN","0xSELF_TOKEN"]' \
  "0xYOUR_OWNER_ADDRESS" \
  "0xTREASURY_PROXY_ADDRESS"
```

---

### Method 2: BaseScan UI (Manual)

**Steps**:

1. **Go to BaseScan**: https://basescan.org/
2. **Find your contract**: Paste contract address in search
3. **Click "Contract" tab**
4. **Click "Verify and Publish"**
5. **Fill in details**:
   - Compiler Type: Solidity (Single file)
   - Compiler Version: v0.8.20 (match your contract)
   - Open Source License Type: MIT
   - Optimization: Yes (200 runs)
6. **Paste contract source code**
7. **Enter constructor arguments** (ABI-encoded)
8. **Submit**

**Getting ABI-Encoded Constructor Args**:
```typescript
import { ethers } from 'ethers';

// Example for PodFactory
const encoded = ethers.utils.defaultAbiCoder.encode(
  ['address'], // Types
  ['0x3bc1A0Ad72417f2d411118085256fC53CBdDd137'] // Values
);
console.log(encoded);
```

---

### Method 3: Foundry (Alternative)

**Prerequisites**:
```bash
forge install
```

**Verification Command**:
```bash
forge verify-contract \
  --chain-id 8453 \
  --compiler-version v0.8.20 \
  --optimizer-runs 200 \
  --constructor-args $(cast abi-encode "constructor(address)" "0x3bc1...") \
  0xYOUR_CONTRACT_ADDRESS \
  src/contracts/YourContract.sol:YourContract \
  --etherscan-api-key $BASESCAN_API_KEY
```

---

## 📝 VERIFICATION CHECKLIST

Create file: `CONTRACT_VERIFICATION_CHECKLIST.md`

```markdown
# Contract Verification Status

## Core Infrastructure
- [ ] PodFactoryV2 - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] PodManagerV2 - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] TreasuryProxy - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] PodTreasuryFactory - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:

## Event System
- [ ] EventSystemFactory - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] EventEscrow - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] EventRegistrationNFTFactory - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] EventCompletionNFTFactory - `0x...`
  - Verified: ❌
  - Link:
  - Verified on:

## Bounty System
- [ ] BountyManagerV2 - `0x29e653502083442B8B6C7c969557022F6a3CC64C`
  - Verified: ❌
  - Link:
  - Verified on:
- [ ] PodBountyService - `0x...` (if deployed)
  - Verified: ❌
  - Link:
  - Verified on:

## Verification Complete
- [ ] All core contracts verified
- [ ] Verification links documented
- [ ] Links added to documentation
```

---

## 🚨 COMMON ERRORS & SOLUTIONS

### Error: "Compiler version mismatch"
**Solution**: Check `pragma solidity` in your contract. Use exact version:
```bash
--compiler-version v0.8.20+commit.a1b79de6
```

### Error: "Constructor arguments mismatch"
**Solution**: Double-check constructor args match deployment. Use this helper:
```typescript
// Get args from deployment transaction
const tx = await ethers.provider.getTransaction('0xDEPLOYMENT_TX_HASH');
const deployData = tx.data;
// Constructor args are after bytecode
```

### Error: "Bytecode mismatch"
**Solutions**:
1. Check optimizer settings (enabled: true, runs: 200)
2. Check Solidity version matches exactly
3. Check imported contracts (OpenZeppelin version, etc.)
4. Try `--via-ir` flag if using Yul optimizer

### Error: "Already verified"
**Solution**: Good! Contract is already verified. Get link from BaseScan.

---

## 📊 VERIFICATION SCRIPT

Create: `scripts/verify-all-contracts.sh`

```bash
#!/bin/bash

# Contract Verification Script for Base Mainnet
# Usage: ./scripts/verify-all-contracts.sh

# Load environment variables
source .env

echo "🔍 Verifying contracts on BaseScan..."
echo "Network: Base Mainnet (8453)"
echo "============================================"

# Core Infrastructure
echo "\n📦 Verifying Core Infrastructure..."

# 1. Pod Factory
echo "\n1️⃣ Pod Factory V2..."
npx hardhat verify --network base \
  $NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137" \
  || echo "⚠️  Pod Factory verification failed (may already be verified)"

# 2. Pod Manager
echo "\n2️⃣ Pod Manager V2..."
npx hardhat verify --network base \
  $NEXT_PUBLIC_POD_MANAGER_V2_ADDRESS \
  "$NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS" \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137" \
  || echo "⚠️  Pod Manager verification failed (may already be verified)"

# 3. Treasury Proxy
echo "\n3️⃣ Treasury Proxy..."
npx hardhat verify --network base \
  $NEXT_PUBLIC_TREASURY_PROXY \
  "$NEXT_PUBLIC_POD_TREASURY_FACTORY" \
  || echo "⚠️  Treasury Proxy verification failed (may already be verified)"

# 4. Treasury Factory
echo "\n4️⃣ Pod Treasury Factory..."
npx hardhat verify --network base \
  $NEXT_PUBLIC_POD_TREASURY_FACTORY \
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137" \
  "[\"$NEXT_PUBLIC_SYSTEM_TOKEN\",\"$NEXT_PUBLIC_SELF_TOKEN\"]" \
  "$TREASURY_FACTORY_OWNER" \
  "$NEXT_PUBLIC_TREASURY_PROXY" \
  || echo "⚠️  Treasury Factory verification failed (may already be verified)"

echo "\n✅ Core infrastructure verification complete!"
echo "Check BaseScan for verification status"
echo "============================================"
```

---

## 📖 DOCUMENTATION

After verification, update your documentation:

### 1. README.md
```markdown
## Verified Contracts

All smart contracts are verified on BaseScan for transparency:

- **Pod Factory V2**: [View on BaseScan](https://basescan.org/address/0x...)
- **Pod Manager V2**: [View on BaseScan](https://basescan.org/address/0x...)
- **Treasury Proxy**: [View on BaseScan](https://basescan.org/address/0x...)
- **Bounty Manager V2**: [View on BaseScan](https://basescan.org/address/0x29e653502083442B8B6C7c969557022F6a3CC64C)
```

### 2. DEPLOYMENT.md
Add verification hashes and links for auditing.

---

## ✅ COMPLETION CRITERIA

Contract verification is complete when:

- [ ] All Priority 1 contracts verified (Pod Factory, Manager, Treasury)
- [ ] All Priority 2 contracts verified (Event System)
- [ ] Bounty Manager V2 verified
- [ ] All verification links documented
- [ ] Verification script created and tested
- [ ] Documentation updated with BaseScan links
- [ ] Verification checklist complete

---

## 🎯 NEXT STEPS

1. Get BaseScan API key: https://basescan.org/myapikey
2. Add to `.env`: `BASESCAN_API_KEY=your_key`
3. Run verification script
4. Document verification links
5. Add links to README and docs
6. Mark contracts as verified in deployment guide

---

**Estimated Time**: 2-3 hours
**Priority**: HIGH (before production launch)
**Dependencies**: Need constructor args from deployment

**Questions?** Check BaseScan documentation: https://docs.basescan.org/
