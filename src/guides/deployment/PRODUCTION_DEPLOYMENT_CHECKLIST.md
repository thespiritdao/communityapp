# SpiritDAO Production Deployment Checklist

## Pre-Deployment Readiness Assessment
**Current Status**: 70% Production Ready (Updated 2025-11-23)

---

## Table of Contents
1. [Environment Configuration](#environment-configuration)
2. [Database & Backend](#database--backend)
3. [Smart Contracts & Blockchain](#smart-contracts--blockchain)
4. [Frontend & UI](#frontend--ui)
5. [Security & Compliance](#security--compliance)
6. [Performance & Optimization](#performance--optimization)
7. [Testing & Quality Assurance](#testing--quality-assurance)
8. [Monitoring & Logging](#monitoring--logging)
9. [Deployment Process](#deployment-process)
10. [Post-Deployment Validation](#post-deployment-validation)
11. [Rollback Plan](#rollback-plan)

---

## Environment Configuration

### Environment Variables
- [ ] **Verify all production environment variables are set**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` (production Supabase URL)
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production anon key)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (secure, server-side only)
  - [ ] `NEXT_PUBLIC_HATS_CONTRACT` (verified Base mainnet address)
  - [ ] `NEXT_PUBLIC_POD_CREATION_MANAGER` (verified deployment)
  - [ ] `NEXT_PUBLIC_CDP_API_KEY` (Coinbase Developer Platform key)
  - [ ] `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
  - [ ] `NEXT_PUBLIC_ONCHAINKIT_API_KEY`
  - [ ] `NEXT_PUBLIC_PAYMASTER_URL` (Coinbase Paymaster v3 endpoint)

- [ ] **Verify environment variable security**
  - [ ] No sensitive keys exposed in client-side code
  - [ ] All server-side keys properly secured (not in `.env.local` committed to git)
  - [ ] Service role key only used in server components/API routes
  - [ ] API keys rotated from development values

- [ ] **Domain Configuration**
  - [ ] Production domain registered and verified
  - [ ] SSL/TLS certificates provisioned
  - [ ] DNS records configured correctly
  - [ ] CORS settings updated for production domain
  - [ ] Callback URLs updated (Coinbase Wallet, WalletConnect, etc.)

---

## Database & Backend

### Supabase Configuration
- [ ] **Database Schema Audit** ⚠️ **PENDING**
  - [ ] Run discovery queries to verify schema integrity
  - [ ] Verify all RLS policies are correctly configured
  - [ ] Check foreign key constraints
  - [ ] Validate indexes for query performance
  - [ ] Reference: [Supabase Database Audit Guide](./SUPABASE_DATABASE_AUDIT_GUIDE.md)

- [ ] **Row-Level Security (RLS)**
  - [ ] All tables have appropriate RLS policies enabled
  - [ ] Test policies with different user roles (leader, member, non-member)
  - [ ] Verify pod-specific access restrictions work correctly
  - [ ] Test notification preferences RLS
  - [ ] Test governance_notifications table access

- [ ] **Database Migrations**
  - [ ] All pending migrations applied to production database
  - [ ] Migration rollback scripts prepared
  - [ ] Backup created before migration
  - [ ] Test migrations on staging environment first

- [ ] **Supabase Storage**
  - [ ] Event images bucket configured with proper RLS
  - [ ] Product images bucket configured
  - [ ] Pod images/avatars bucket configured
  - [ ] Storage quotas and limits appropriate for production
  - [ ] CDN/caching configured for static assets

### API Routes
- [ ] **Rate Limiting**
  - [ ] Implement rate limiting on public API routes
  - [ ] Configure appropriate limits per endpoint
  - [ ] Test rate limiting under load

- [ ] **Error Handling**
  - [ ] All API routes have proper error handling
  - [ ] Errors return appropriate HTTP status codes
  - [ ] Sensitive error details not exposed to clients
  - [ ] Error logging configured

---

## Smart Contracts & Blockchain

### Contract Verification ✅ **COMPLETE**
- [x] **Hats Protocol Contract**
  - [x] Contract address verified: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`
  - [x] Verified on BaseScan
  - [x] Reference: [Contract Verification Guide](./CONTRACT_VERIFICATION_GUIDE.md)

- [x] **PodCreationManager Contract**
  - [x] Contract address verified: `0x43C124Df0dFb324CCC742808D9FdF62C764f2644`
  - [x] Verified on BaseScan
  - [x] Ownership and access control verified

### Paymaster Configuration
- [ ] **Coinbase Paymaster v3**
  - [ ] Production paymaster URL configured
  - [ ] API key for production environment set
  - [ ] Whitelist contracts added to paymaster
    - [ ] Hats Protocol contract
    - [ ] PodCreationManager contract
    - [ ] Any other sponsored transaction targets
  - [ ] Funding verified (Paymaster has sufficient ETH)
  - [ ] Test sponsored transactions on Base mainnet
  - [ ] Contact info: [Coinbase Support Ticket](./COINBASE_SUPPORT_TICKET_DOUBLE_POPUP.md)

### Network Configuration
- [ ] **Base Mainnet Settings**
  - [ ] RPC endpoints configured (primary + fallback)
  - [ ] Chain ID verified (8453 for Base)
  - [ ] Block explorer links point to BaseScan
  - [ ] Gas estimation configured appropriately

---

## Frontend & UI

### Visual Consistency ✅ **COMPLETE**
- [x] **SpiritDAO Design System Implemented**
  - [x] All primary colors updated to SpiritDAO palette
  - [x] Button system standardized (26 files updated)
  - [x] Container backgrounds use sacred minimalism tones
  - [x] Marketplace components fully themed
  - [x] Reference: [Visual Style Guide](./SPIRITDAO_VISUAL_STYLE_GUIDE.md)

- [ ] **Emoji Replacement** 🔄 **IN PROGRESS (12% complete)**
  - [x] Marketplace emojis replaced with Lucide icons (6 files)
  - [ ] Pod management pages (estimated 15 files)
  - [ ] Event components (estimated 5 files)
  - [ ] Bounty components (estimated 8 files)
  - [ ] Admin/debug tools (estimated 16 files)
  - [ ] Reference: [Marketplace Audit](./MARKETPLACE_AND_FEATURES_AUDIT_COMPLETE.md)

### Responsive Design
- [ ] **Mobile Testing**
  - [ ] Test all pages on mobile viewport (375px, 768px)
  - [ ] Verify navigation/bottom nav on mobile
  - [ ] Test wallet connection on mobile browsers
  - [ ] Test transaction modals fit on mobile screens
  - [ ] Verify form inputs are mobile-friendly

- [ ] **Tablet Testing**
  - [ ] Test layouts at 768px, 1024px breakpoints
  - [ ] Verify grid/flexbox layouts adapt correctly

- [ ] **Desktop Testing**
  - [ ] Test at 1280px, 1440px, 1920px
  - [ ] Verify max-width containers prevent excessive stretching
  - [ ] Test multi-column layouts

### Performance
- [ ] **Bundle Size**
  - [ ] Run `npm run build` and check bundle sizes
  - [ ] Ensure no excessively large chunks
  - [ ] Verify code splitting is working
  - [ ] Check for duplicate dependencies

- [ ] **Image Optimization**
  - [ ] All images use Next.js Image component
  - [ ] Proper width/height attributes set
  - [ ] Lazy loading enabled for below-fold images
  - [ ] WebP format used where possible

- [ ] **Fonts & Assets**
  - [ ] Fonts preloaded/optimized
  - [ ] Icons tree-shaken (Lucide React)
  - [ ] Unused CSS purged

### Accessibility
- [ ] **WCAG AA Compliance**
  - [ ] Color contrast ratios verified (4.5:1 minimum)
  - [ ] All interactive elements keyboard accessible
  - [ ] Form labels properly associated
  - [ ] ARIA labels on icon buttons
  - [ ] Focus indicators visible

### Browser Compatibility
- [ ] **Test in Major Browsers**
  - [ ] Chrome (latest)
  - [ ] Firefox (latest)
  - [ ] Safari (latest)
  - [ ] Edge (latest)
  - [ ] Mobile Safari (iOS)
  - [ ] Chrome Mobile (Android)

---

## Security & Compliance

### Authentication & Authorization
- [ ] **Wallet Authentication**
  - [ ] SIWE (Sign-In with Ethereum) working correctly
  - [ ] Nonce generation secure
  - [ ] Session management secure
  - [ ] Token expiration configured

- [ ] **Authorization Checks**
  - [ ] Hat-based permissions enforced on frontend
  - [ ] Backend API routes verify permissions
  - [ ] Pod membership verified before access
  - [ ] Leadership roles properly gated

### Data Privacy
- [ ] **User Data Protection**
  - [ ] No PII stored unnecessarily
  - [ ] Wallet addresses properly hashed/lowercased
  - [ ] GDPR compliance considered (if applicable)
  - [ ] Privacy policy updated

### Smart Contract Security
- [ ] **Transaction Safety**
  - [ ] All transaction parameters validated before submission
  - [ ] Gas limits reasonable
  - [ ] Slippage protection where applicable
  - [ ] Reentrancy protection (if custom contracts)

- [ ] **User Warnings**
  - [ ] Transaction confirmation modals show clear details
  - [ ] Destructive actions require confirmation
  - [ ] Gas cost estimates displayed
  - [ ] Network fees transparent

---

## Performance & Optimization

### Server-Side Rendering
- [ ] **Next.js Configuration**
  - [ ] Appropriate pages use SSR/SSG
  - [ ] API routes optimized
  - [ ] Middleware configured correctly
  - [ ] Redirects and rewrites tested

### Caching Strategy
- [ ] **Frontend Caching**
  - [ ] React Query cache configuration appropriate
  - [ ] Stale-while-revalidate patterns used
  - [ ] Manual invalidation triggers working

- [ ] **API Caching**
  - [ ] Appropriate endpoints cached (e.g., hat metadata)
  - [ ] Cache TTLs configured reasonably
  - [ ] Cache invalidation on data mutations

### Load Testing
- [ ] **Concurrent Users**
  - [ ] Test with 10 concurrent users
  - [ ] Test with 50 concurrent users
  - [ ] Test with 100 concurrent users
  - [ ] Verify no degradation or timeouts

- [ ] **Database Load**
  - [ ] Test with typical query volume
  - [ ] Verify indexes improve query performance
  - [ ] Check connection pool limits

---

## Testing & Quality Assurance

### Functional Testing
- [ ] **Critical User Flows**
  - [ ] User connects wallet successfully
  - [ ] User joins a pod (application + approval)
  - [ ] User creates a bounty (if authorized)
  - [ ] User submits bid on bounty
  - [ ] Leader approves bid and assigns bounty
  - [ ] User submits work and receives payment
  - [ ] User creates governance proposal
  - [ ] User votes on proposal
  - [ ] User creates event
  - [ ] User registers for event and checks in
  - [ ] User purchases product from marketplace
  - [ ] User views and fulfills own orders

- [ ] **Pod Management Flows**
  - [ ] Create new pod with hat deployment
  - [ ] Deploy treasury for pod
  - [ ] Add members to pod
  - [ ] Remove members from pod
  - [ ] Update pod settings (modules, permissions)
  - [ ] Sign pod agreements
  - [ ] Delete pod (if applicable)

### Edge Cases
- [ ] **Error Scenarios**
  - [ ] User rejects wallet connection
  - [ ] User rejects transaction signature
  - [ ] Transaction fails on-chain
  - [ ] Network connection lost mid-transaction
  - [ ] Invalid input data submitted
  - [ ] Unauthorized access attempted
  - [ ] Pod not found / invalid ID

- [ ] **Boundary Conditions**
  - [ ] Empty states (no pods, no bounties, no events)
  - [ ] Maximum limits (e.g., max pod members)
  - [ ] Concurrent operations (two users editing same data)

### Automated Testing
- [ ] **Unit Tests**
  - [ ] Core utility functions tested
  - [ ] Service layer functions tested
  - [ ] Component logic tested

- [ ] **Integration Tests**
  - [ ] API routes tested with mocked Supabase
  - [ ] Contract interaction flows tested
  - [ ] Authentication flows tested

---

## Monitoring & Logging

### Application Monitoring
- [ ] **Error Tracking**
  - [ ] Sentry (or similar) configured for production
  - [ ] Source maps uploaded for debugging
  - [ ] Error notifications configured
  - [ ] Team members added to alerts

- [ ] **Performance Monitoring**
  - [ ] Web Vitals tracked (LCP, FID, CLS)
  - [ ] API response times monitored
  - [ ] Database query performance tracked

### Logging
- [ ] **Application Logs**
  - [ ] Structured logging implemented
  - [ ] Log levels appropriate (error, warn, info, debug)
  - [ ] Sensitive data redacted from logs
  - [ ] Logs centralized (e.g., Vercel logs, CloudWatch)

- [ ] **Security Logs**
  - [ ] Failed authentication attempts logged
  - [ ] Unauthorized access attempts logged
  - [ ] Suspicious activity flagged

### Analytics
- [ ] **User Analytics**
  - [ ] Page views tracked
  - [ ] User engagement metrics tracked
  - [ ] Conversion funnels defined
  - [ ] Privacy-compliant tracking

- [ ] **Business Metrics**
  - [ ] Pod creation rate tracked
  - [ ] Bounty completion rate tracked
  - [ ] Event attendance tracked
  - [ ] Marketplace transaction volume tracked

---

## Deployment Process

### Pre-Deployment
- [ ] **Code Freeze**
  - [ ] No new features merged to main branch
  - [ ] Only critical bug fixes allowed
  - [ ] All tests passing on CI/CD

- [ ] **Backup Strategy**
  - [ ] Database backup created
  - [ ] Current production environment documented
  - [ ] Rollback plan documented

### Deployment Steps
1. [ ] **Staging Deployment**
   - [ ] Deploy to staging environment
   - [ ] Run full test suite on staging
   - [ ] Smoke test critical flows
   - [ ] Performance test on staging

2. [ ] **Production Deployment**
   - [ ] Deploy to production (Vercel/hosting platform)
   - [ ] Monitor deployment logs for errors
   - [ ] Verify deployment completed successfully
   - [ ] Check production URL loads correctly

3. [ ] **Database Migrations (if applicable)**
   - [ ] Run migrations on production database
   - [ ] Verify migrations completed successfully
   - [ ] Check data integrity post-migration

4. [ ] **Cache Invalidation**
   - [ ] Clear CDN cache if applicable
   - [ ] Clear application cache if applicable

### Communication
- [ ] **Stakeholder Notification**
  - [ ] Notify team of deployment start
  - [ ] Notify team of deployment completion
  - [ ] Announce to community (if applicable)
  - [ ] Update status page (if applicable)

---

## Post-Deployment Validation

### Immediate Checks (0-15 minutes)
- [ ] **Basic Functionality**
  - [ ] Homepage loads correctly
  - [ ] Wallet connection works
  - [ ] Navigation works
  - [ ] Critical pages load without errors

- [ ] **Critical User Flows**
  - [ ] Test one complete pod join flow
  - [ ] Test one bounty creation (if authorized user available)
  - [ ] Test one marketplace purchase
  - [ ] Test one governance vote

- [ ] **Error Monitoring**
  - [ ] Check error tracking dashboard for spikes
  - [ ] Review deployment logs for errors
  - [ ] Check for any 500 errors

### Short-Term Monitoring (15 minutes - 24 hours)
- [ ] **Performance Metrics**
  - [ ] Monitor response times
  - [ ] Check database query performance
  - [ ] Monitor memory usage
  - [ ] Check for any timeouts

- [ ] **User Feedback**
  - [ ] Monitor support channels for issues
  - [ ] Check for user-reported bugs
  - [ ] Gather feedback on new features

### Long-Term Monitoring (24 hours - 1 week)
- [ ] **Usage Patterns**
  - [ ] Verify expected user activity levels
  - [ ] Check for any unusual patterns
  - [ ] Monitor conversion rates

- [ ] **System Health**
  - [ ] Database performance stable
  - [ ] No memory leaks
  - [ ] Error rates within acceptable range

---

## Rollback Plan

### Rollback Triggers
Execute rollback if any of the following occur:
- Critical functionality broken (users cannot connect wallets)
- Data integrity issues detected
- Security vulnerability exposed
- Error rate exceeds 5% of requests
- Performance degradation > 50% baseline

### Rollback Steps
1. [ ] **Immediate Actions**
   - [ ] Notify team of rollback decision
   - [ ] Stop accepting new transactions if possible
   - [ ] Preserve logs and error data for analysis

2. [ ] **Revert Application Code**
   - [ ] Revert to previous Vercel deployment
   - [ ] Or redeploy previous git commit
   - [ ] Verify previous version loads correctly

3. [ ] **Database Rollback (if migrations ran)**
   - [ ] Restore database backup
   - [ ] Or run rollback migration scripts
   - [ ] Verify data integrity

4. [ ] **Verify Rollback**
   - [ ] Test critical user flows
   - [ ] Check error rates return to baseline
   - [ ] Monitor for 30 minutes post-rollback

5. [ ] **Post-Mortem**
   - [ ] Document what went wrong
   - [ ] Identify root cause
   - [ ] Create action items to prevent recurrence
   - [ ] Update deployment checklist

---

## Production Readiness Score

### Current Status: 70%

| Category | Status | Score |
|----------|--------|-------|
| Environment Configuration | 🟡 In Progress | 80% |
| Database & Backend | 🟡 Pending Audit | 60% |
| Smart Contracts | ✅ Complete | 100% |
| Frontend & UI | 🟡 In Progress | 85% |
| Security & Compliance | 🟡 In Progress | 70% |
| Performance & Optimization | 🔴 Not Started | 40% |
| Testing & QA | 🟡 In Progress | 65% |
| Monitoring & Logging | 🔴 Not Started | 30% |
| Deployment Process | 🟡 Documented | 75% |

### Critical Blockers Before Production
1. ⚠️ **Supabase Database Audit** - Must complete schema verification
2. ⚠️ **Paymaster Whitelist** - Must verify all contracts whitelisted
3. ⚠️ **Emoji Replacement** - Complete for all user-facing pages
4. ⚠️ **Error Monitoring** - Must configure Sentry or equivalent
5. ⚠️ **Load Testing** - Must verify performance under load

### Target Production Date
**Recommendation**: 2-3 weeks from current date, pending completion of critical blockers.

---

## Support & Escalation

### Deployment Team
- **Lead**: [Your Name]
- **Backend**: [Name]
- **Frontend**: [Name]
- **DevOps**: [Name]
- **QA**: [Name]

### Emergency Contacts
- **Coinbase Support**: [Support Ticket Reference](./COINBASE_SUPPORT_TICKET_DOUBLE_POPUP.md)
- **Supabase Support**: support@supabase.com
- **Hosting Platform**: [Vercel/other]
- **On-Call Engineer**: [Contact Info]

### External Dependencies
- **Hats Protocol**: https://docs.hatsprotocol.xyz
- **Base Network**: https://docs.base.org
- **Coinbase Paymaster**: https://docs.cdp.coinbase.com

---

## References

- [Contract Verification Guide](./CONTRACT_VERIFICATION_GUIDE.md)
- [Supabase Database Audit Guide](./SUPABASE_DATABASE_AUDIT_GUIDE.md)
- [Visual Style Guide](./SPIRITDAO_VISUAL_STYLE_GUIDE.md)
- [Marketplace Audit Report](./MARKETPLACE_AND_FEATURES_AUDIT_COMPLETE.md)
- [App-Wide CSS Standardization](./APP_WIDE_CSS_STANDARDIZATION_COMPLETE.md)
- [Environment Validation Guide](./ENVIRONMENT_VALIDATION_GUIDE.md)
- [Bounty Module Audit](./BOUNTY_MODULE_PRODUCTION_AUDIT.md)

---

**Last Updated**: 2025-11-23
**Next Review**: Before production deployment
**Owner**: Engineering Team
