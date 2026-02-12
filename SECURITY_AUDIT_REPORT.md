# Security Audit Report
**Date:** 2026-02-12
**Total Vulnerabilities:** 102 (37 low, 25 moderate, 40 high, 0 critical)

## Summary

This report documents all npm audit findings and the remediation strategy.

---

## 🔴 HIGH SEVERITY (40 vulnerabilities)

### 1. **next** (10.0.0 - 15.5.9) - 4 vulnerabilities
- **Issues:**
  - Server Actions Source Code Exposure (GHSA-w37m-7fhw-fmv9)
  - Denial of Service with Server Components (GHSA-mwv6-3258-q52c)
  - DoS via Image Optimizer remotePatterns (GHSA-9g9p-9gw9-jx7f)
  - HTTP request deserialization DoS (GHSA-h25m-26qc-wcjf)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 2. **axios** (<=1.13.4) - 4 vulnerabilities
- **Issues:**
  - SSRF and Credential Leakage via Absolute URL (GHSA-jr5f-v2jv-69x6)
  - DoS attack through lack of data size check (GHSA-4hjh-wcwx-xvwj) - listed twice
  - DoS via __proto__ Key in mergeConfig (GHSA-43fc-jf86-j433)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 3. **playwright** (<1.55.1)
- **Issue:** Downloads browsers without SSL certificate verification (GHSA-7mvr-c777-76hp)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 4. **qs** (<6.14.1)
- **Issue:** arrayLimit bypass allows DoS via memory exhaustion (GHSA-6rw7-vpxm-498p)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 5. **storybook** (8.0.0 - 8.6.14)
- **Issue:** Manager bundle may expose environment variables (GHSA-8452-54wp-rmv6)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 6. **tar** (<=7.5.6) - 3 vulnerabilities
- **Issues:**
  - Arbitrary File Overwrite and Symlink Poisoning (GHSA-8qq5-rm4j-mr97)
  - Race Condition via Unicode Ligature Collisions (GHSA-r6q2-hw4h-h46w)
  - Arbitrary File Creation via Hardlink Traversal (GHSA-34x7-hfp2-rc4v)
- **Fix:** `npm audit fix --force` (BREAKING - updates npm to 11.10.0)
- **Status:** ⏳ Pending - requires review

### 7. **jws** (<3.2.3)
- **Issue:** Improperly Verifies HMAC Signature (GHSA-869p-cjfg-cm3x)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 8. **h3** (<=1.15.4)
- **Issue:** Request Smuggling (TE.TE) issue (GHSA-mp2g-9vg9-f4cg)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 9. **fast-xml-parser** (5.0.9 - 5.3.3)
- **Issue:** RangeError DoS Numeric Entities Bug (GHSA-37qj-frw5-hhjh)
- **Fix:** `npm audit fix` (non-breaking)
- **Affects:** @aws-sdk/client-ses and entire AWS SDK chain
- **Status:** ⏳ Pending

### 10. **glob** (10.2.0 - 10.4.5)
- **Issue:** Command injection via -c/--cmd flag (GHSA-5j98-mcp5-4vw2)
- **Fix:** `npm audit fix --force` (BREAKING - updates npm to 11.10.0)
- **Status:** ⏳ Pending - requires review

### 11. **lodash.set** (*)
- **Issue:** Prototype Pollution (GHSA-p6mc-m468-83gw)
- **Fix:** `npm audit fix --force` (BREAKING - updates @snapshot-labs/snapshot.js to 0.1.2)
- **Status:** ⏳ Pending - requires review

### 12. **ws** (8.0.0 - 8.17.0)
- **Issue:** DoS when handling request with many HTTP headers (GHSA-3h5v-q93c-6h6q)
- **Fix:** `npm audit fix --force` (BREAKING - updates @biconomy/common to 4.1.1)
- **Status:** ⏳ Pending - requires review

---

## 🟡 MODERATE SEVERITY (25 vulnerabilities)

### 1. **@babel/runtime** (<7.26.10)
- **Issue:** Inefficient RegExp complexity with .replace (GHSA-968p-4wvh-cqc8)
- **Fix:** `npm audit fix --force` (BREAKING - updates react-mentions to 3.0.2)
- **Status:** ⏳ Pending - requires review

### 2. **@metamask/sdk** (0.16.0 - 0.33.0)
- **Issue:** Indirectly exposed via malicious debug@4.4.2 (GHSA-qj3p-xc97-xw74)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 3. **esbuild** (<=0.24.2)
- **Issue:** Enables websites to send requests to dev server (GHSA-67mh-4wv8-2f99)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 4. **js-yaml** (<3.14.2 || >=4.0.0 <4.1.1)
- **Issue:** Prototype pollution in merge (<<) (GHSA-mh29-5h37-fv8m)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 5. **lodash** (4.0.0 - 4.17.21)
- **Issue:** Prototype Pollution in _.unset and _.omit (GHSA-xxjr-mmjv-4gpg)
- **Fix:** No fix available
- **Status:** ❌ Cannot fix - document mitigation

### 6. **mdast-util-to-hast** (13.0.0 - 13.2.0)
- **Issue:** Unsanitized class attribute (GHSA-4fh9-h7wg-q85m)
- **Fix:** `npm audit fix` (non-breaking)
- **Status:** ⏳ Pending

### 7. **nodemailer** (<=7.0.10) - 2 vulnerabilities
- **Issues:**
  - Email to unintended domain (GHSA-mm7p-fcc7-pg87)
  - DoS via recursive calls (GHSA-rcmh-qjqh-p98v)
- **Fix:** `npm audit fix --force` (BREAKING - updates to 8.0.1)
- **Status:** ⏳ Pending - requires review

### 8. **undici** (<6.23.0)
- **Issue:** Unbounded decompression chain leads to resource exhaustion (GHSA-g9mf-h72j-4rw9)
- **Fix:** No fix available
- **Status:** ❌ Cannot fix - document mitigation

---

## 🟢 LOW SEVERITY (37 vulnerabilities)

### Development Tools (Not Production Impact)
- **@anthropic-ai/claude-code** (<=2.1.6) - 11 vulnerabilities
  - Multiple command injection and sandbox escape issues
  - **Fix:** `npm audit fix` (non-breaking)
  - **Impact:** Dev tool only, not in production bundle
  - **Status:** ⏳ Pending

### Blockchain/Crypto Dependencies (Unfixable)
- **elliptic** (*) - Cryptographic Primitive with Risky Implementation
  - **Affects:** @ethersproject/*, ethers 5.x-6.x, ethereum-cryptography, secp256k1
  - **Fix:** No fix available (awaiting ethers v7 release)
  - **Status:** ❌ Cannot fix - migration to ethers v7 when available

- **cookie** (<0.7.0) - Out of bounds characters
  - **Affects:** @sentry/node, hardhat chain
  - **Fix:** No fix available
  - **Status:** ❌ Cannot fix - document mitigation

- **tmp** (<=0.2.3) - Symbolic link directory write
  - **Affects:** solc (Solidity compiler)
  - **Fix:** No fix available
  - **Status:** ❌ Cannot fix - document mitigation

- **web3-core-subscriptions** (<=2.0.0-alpha.1) - Prototype Pollution
  - **Fix:** No fix available
  - **Status:** ❌ Cannot fix - document mitigation

- **diff** (4.0.0 - 5.2.1) - DoS in parsePatch/applyPatch
  - **Fix:** `npm audit fix` (non-breaking)
  - **Status:** ⏳ Pending

---

## 📋 Remediation Strategy

### Phase 1: Safe Fixes (Non-Breaking)
Run automatic fixes for vulnerabilities that don't require breaking changes:
```bash
npm audit fix
```

**Expected to fix:**
- next, axios, playwright, qs, storybook
- @metamask/sdk, esbuild, js-yaml, mdast-util-to-hast
- jws, h3, fast-xml-parser, diff
- @anthropic-ai/claude-code

### Phase 2: Breaking Changes (Requires Testing)
Review and apply breaking changes one at a time:

```bash
# 1. Update nodemailer (7.x → 8.x)
npm install nodemailer@latest

# 2. Update react-mentions (for @babel/runtime fix)
npm install react-mentions@latest

# 3. Update @snapshot-labs/snapshot.js (for lodash.set fix)
npm install @snapshot-labs/snapshot.js@latest

# 4. Update @biconomy/common (for ws fix)
npm install @biconomy/common@latest

# 5. Update npm (for tar/glob fixes) - CAUTION
npm install -g npm@11.10.0
```

**Test after each update:**
- Run build: `npm run build`
- Test affected features
- Check for runtime errors

### Phase 3: Document Unfixable Issues

**No fixes available for:**
1. **elliptic** - Blockchain dependency (awaiting ethers v7)
2. **lodash** - Prototype pollution (deep dependency)
3. **cookie** - Development dependency via hardhat
4. **tmp** - Solidity compiler dependency
5. **undici** - @xmtp/proto dependency
6. **web3-core-subscriptions** - Web3 alpha version

**Mitigation strategies:**
- These are mostly dev dependencies or deep transitive dependencies
- Production runtime is not directly affected
- Monitor for upstream fixes
- Consider alternative packages when available

---

## 🎯 Priority Order

1. **Critical Path (Do First):**
   - ✅ Run `npm audit fix` for safe updates
   - ✅ Update Next.js (security + features)
   - ✅ Update axios (SSRF vulnerability)
   - ✅ Update AWS SDK (fast-xml-parser)

2. **Medium Priority:**
   - Review and test breaking changes (nodemailer, react-mentions)
   - Update development tools (playwright, storybook)

3. **Low Priority:**
   - Document unfixable vulnerabilities
   - Create monitoring plan for upstream fixes

---

## 📊 Risk Assessment

### Production Risk: **MEDIUM**
- High severity issues exist in production dependencies (next, axios)
- Most critical packages have non-breaking fixes available

### Development Risk: **LOW**
- Most unfixable issues are in dev dependencies
- Blockchain tooling vulnerabilities don't affect runtime

### Overall Status: **ACTIONABLE**
- 65+ vulnerabilities can be fixed with `npm audit fix`
- 12-15 require breaking change review
- 20+ have no fix available (acceptable for now)

---

## Next Steps

1. Run Phase 1 (safe fixes)
2. Test build and critical features
3. Review breaking changes individually
4. Document unfixable issues in project README
5. Set up dependabot alerts monitoring
