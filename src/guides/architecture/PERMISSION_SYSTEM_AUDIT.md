# Permission System Comprehensive Audit

## Objective
Audit all 11 permission-gated features to ensure they follow the unified approach established with chat permissions:
1. **Frontend Filtering** - Load permissions from database, filter UI based on role permissions
2. **Frontend Enforcement** - Check permissions before rendering sensitive components
3. **Backend API Validation** - Validate authentication, wallet ownership, and permissions

## Permission Types to Audit

### Database Schema Reference
Table: `pod_role_permissions`
- Primary key: `id` (UUID)
- Foreign keys: `pod_id`, `token_address` (HAT ID)
- Permissions stored in `permissions` JSONB field:

```typescript
interface HatPermissions {
  chatAccess: boolean;                    // ✅ FIXED
  governanceParticipation: boolean;       // ⏳ TO AUDIT
  eventCreation: boolean;                 // ⏳ TO AUDIT
  treasuryViewing: boolean;               // ⏳ TO AUDIT
  treasuryManagement: boolean;            // ⏳ TO AUDIT
  memberManagement: boolean;              // ⏳ TO AUDIT
  subPodCreation: boolean;                // ⏳ TO AUDIT
  roleAssignment: boolean;                // ⏳ TO AUDIT
  forumModeration: boolean;               // ⏳ TO AUDIT
  bountyManagement: boolean;              // ⏳ TO AUDIT
  marketplaceAccess: boolean;             // ⏳ TO AUDIT
  marketplaceManage: boolean;             // ⏳ TO AUDIT
}
```

---

## 1. Governance Participation ⏳

### Description
Participate in community governance (create proposals, vote on proposals)

### Key Files Identified
- **Frontend Pages:**
  - `src/app/governance/page.tsx` - Main governance page
  - `src/app/governance/[id]/page.tsx` - Proposal detail page

- **Frontend Components:**
  - `src/features/governance/components/CreateProposalForm.tsx`
  - `src/features/governance/components/ProposalsList.tsx`
  - `src/features/governance/components/VoteButton.tsx`
  - `src/features/governance/components/ProposalVoteForm.tsx`

- **Hooks:**
  - `src/features/governance/hooks/useGovernanceParticipation.ts`
  - `src/features/governance/hooks/useProposals.ts`

- **Backend APIs:**
  - Need to check `/api` folder for governance routes

### Issues to Check
- [ ] Does CreateProposalForm check `governanceParticipation` permission?
- [ ] Does VoteButton validate permissions before allowing votes?
- [ ] Do backend APIs validate permissions?
- [ ] Is HAT ownership being checked directly (bypassing permission system)?

---

## 2. Event Creation ⏳

### Description
Create and manage community events

### Key Files Identified
- **Frontend Pages:**
  - `src/app/events/create/page.tsx` - Event creation page
  - `src/app/events/manage/page.tsx` - Event management dashboard
  - `src/app/events/manage/[id]/edit/page.tsx` - Edit event

- **Frontend Components:**
  - `src/features/events/components/SimplifiedEventCreationForm.tsx`
  - `src/features/events/components/EventEditForm.tsx`
  - `src/features/events/components/EventManagementDashboard.tsx`

- **Backend APIs:**
  - Need to identify event creation/update API routes

### Issues to Check
- [ ] Does event creation form check `eventCreation` permission?
- [ ] Does event management dashboard filter based on permissions?
- [ ] Do backend APIs validate `eventCreation` permission?
- [ ] Are events filtered by pod membership correctly?

---

## 3. Treasury Viewing ⏳

### Description
View pod treasury and transactions

### Key Files Identified
- **Frontend Pages:**
  - `src/app/pods/[id]/page.tsx` - Pod view page (may show treasury)
  - Treasury-related components in pod features

- **Frontend Components:**
  - Need to search for Treasury viewer components
  - Check `src/features/pods/components/` for treasury UI

### Issues to Check
- [ ] Is treasury information hidden when `treasuryViewing: false`?
- [ ] Do backend APIs validate before returning treasury data?
- [ ] Is treasury data properly gated in pod detail views?

---

## 4. Treasury Management ⏳

### Description
Manage fund distribution, approve transactions

### Key Files Identified
- **Frontend Pages:**
  - Pod treasury management pages

- **Frontend Components:**
  - Treasury management components
  - Fund distribution forms

- **Backend APIs:**
  - Treasury transaction APIs
  - Fund distribution APIs

### Issues to Check
- [ ] Does treasury management UI check `treasuryManagement` permission?
- [ ] Are transaction approval flows gated?
- [ ] Do backend APIs validate permissions for fund operations?

---

## 5. Member Management ⏳

### Description
Manage pod members and roles

### Key Files Identified
- **Frontend Pages:**
  - `src/app/pods/[id]/manage/page.tsx` - Pod management page

- **Frontend Components:**
  - `src/features/pods/components/PodManagerControlPanel.tsx`
  - Member list/management components

- **Backend APIs:**
  - `/api/pods/*` - Pod member APIs

### Issues to Check
- [ ] Does member management tab check `memberManagement` permission?
- [ ] Are add/remove member operations gated?
- [ ] Do backend APIs validate permissions?
- [ ] Is this using direct HAT checks instead of permission checks?

---

## 6. Sub Pod Creation ⏳

### Description
Create and manage sub-pods

### Key Files Identified
- **Frontend Pages:**
  - `src/app/pods/create/page.tsx` - Pod creation (check if it allows sub-pods)

- **Frontend Components:**
  - Pod creation components
  - Sub-pod management UI

### Issues to Check
- [ ] Is sub-pod creation option hidden when `subPodCreation: false`?
- [ ] Do backend APIs validate `subPodCreation` permission?
- [ ] Is parent pod relationship validated correctly?

---

## 7. Role Assignment ⏳

### Description
Assign roles to other members

### Key Files Identified
- **Frontend Components:**
  - `src/features/pods/components/UnifiedMembershipManager.tsx` - Already reviewed
  - `src/features/pods/components/PodManagerControlPanel.tsx` - Role management

### Issues to Check
- [ ] Does role assignment UI check `roleAssignment` permission?
- [ ] Can users without permission modify role assignments?
- [ ] Do backend APIs validate before assigning roles?

---

## 8. Forum Moderation ⏳

### Description
Moderate forum posts and discussions

### Key Files Identified
- **Frontend Components:**
  - `src/features/forum/components/ModerationToolbar.tsx`
  - `src/features/forum/components/ReportQueue.tsx`
  - `src/features/forum/components/ModerationLog.tsx`

- **Hooks:**
  - `src/features/forum/hooks/useModerationPermissions.ts` ⚠️ Promising file!

- **Services:**
  - `src/features/forum/services/ModerationService.ts`

### Issues to Check
- [ ] Does moderation toolbar check `forumModeration` permission?
- [ ] Are moderation actions (delete, mute, ban) properly gated?
- [ ] Do backend APIs validate moderator permissions?

---

## 9. Bounty Management ⏳

### Description
Create and manage bounties

### Key Files Identified
- **Frontend Pages:**
  - `src/app/bounty/page.tsx`

- **Frontend Components:**
  - `src/features/bounty/components/BountyFormV2.tsx`
  - `src/features/bounty/components/BountyManagement.tsx`
  - `src/features/bounty/components/BountyList.tsx`

- **Backend APIs:**
  - `src/app/api/bounty/create/route.ts`
  - `src/app/api/bounty/assignment/route.ts`
  - Other bounty APIs

- **Services:**
  - `src/features/bounty/services/BountyTokenGateService.ts` ⚠️ May use old token gating

### Issues to Check
- [ ] Does bounty creation form check `bountyManagement` permission?
- [ ] Are bounty operations (create, assign, approve) gated?
- [ ] Do backend APIs validate permissions?
- [ ] Is old token gating system still in use?

---

## 10. Marketplace Access ⏳

### Description
View and purchase marketplace products

### Key Files Identified
- **Frontend Pages:**
  - `src/app/marketplace/*` pages

- **Frontend Components:**
  - `src/features/shopping-cart/components/Marketplace/Marketplace.tsx`
  - `src/features/shopping-cart/components/Products/*`

- **Backend APIs:**
  - `src/app/api/marketplace/products/accessible/route.ts` ⚠️ Check permission validation
  - `src/app/api/marketplace/products/list/route.ts`

### Issues to Check
- [ ] Is marketplace page accessible when `marketplaceAccess: false`?
- [ ] Do backend APIs validate marketplace access permission?
- [ ] Are products filtered based on permissions?

---

## 11. Marketplace Manage ⏳

### Description
Create, edit, and delete marketplace products

### Key Files Identified
- **Frontend Components:**
  - `src/features/marketplace/components/AddProductButton/AddProductButton.tsx`
  - `src/features/marketplace/components/ProductManagement/ProductManagement.tsx`
  - `src/features/marketplace/components/AddProductModal/AddProductModal.tsx`

- **Backend APIs:**
  - Need to find product creation/update/delete APIs

### Issues to Check
- [ ] Is "Add Product" button hidden when `marketplaceManage: false`?
- [ ] Do backend APIs validate `marketplaceManage` permission?
- [ ] Can unauthorized users modify products via API?

---

## Common Patterns to Fix

Based on the chat permission fixes, here are the common issues to look for:

### 🔴 Anti-Pattern: Direct HAT Ownership Checks
```javascript
// ❌ WRONG - Bypasses permission system
const hasAccess = userHats.includes(requiredHatId);
```

### ✅ Correct Pattern: Permission-Based Checks
```javascript
// ✅ CORRECT - Uses permission from role
const hasAccess = userRoles.some(role =>
  role.hatId === requiredHatId && role.permissions?.specificPermission
);
```

### 🔴 Anti-Pattern: Field Name Mismatches
```javascript
// ❌ WRONG - hat_id doesn't exist
const hatId = role.hat_id;

// ✅ CORRECT - Use token_address
const hatId = role.token_address;
```

### 🔴 Anti-Pattern: No API Validation
```javascript
// ❌ WRONG - No permission check
export async function POST(request: Request) {
  const data = await request.json();
  await supabase.from('table').insert(data);
  return NextResponse.json({ success: true });
}
```

### ✅ Correct Pattern: Full API Validation
```javascript
// ✅ CORRECT - 4-step validation
export async function POST(request: Request) {
  // 1. Check authentication
  const { data: session } = await supabase.auth.getSession();
  if (!session) return 401;

  // 2. Verify wallet ownership
  const userProfile = await getUserProfile(session.user.id);
  if (userProfile.wallet !== claimedWallet) return 403;

  // 3. Check permission
  const membership = await getPodMembership(podId, wallet);
  const rolePermissions = await getRolePermissions(podId, membership.hat_id);
  if (!rolePermissions.permissions.specificPermission) return 403;

  // 4. Proceed with operation
  await supabase.from('table').insert(data);
  return NextResponse.json({ success: true });
}
```

---

## Next Steps

1. **Phase 1**: Deep dive into each feature's frontend components
2. **Phase 2**: Audit backend API routes for each feature
3. **Phase 3**: Apply fixes systematically
4. **Phase 4**: Test each permission toggle

This document will be updated as the audit progresses.
