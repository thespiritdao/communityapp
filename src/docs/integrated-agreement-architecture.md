# 🏗️ Integrated Agreement Architecture

## Current State Analysis

### Disconnected Systems:
1. **Accountability Agreements** (pod leadership) - hardcoded text, stored in `pod_accountability_signatures`
2. **Eligibility Criteria** (role requirements) - custom text, stored in `pod_role_permissions.eligibility_criteria`

## Ideal Integrated Architecture

### 1. Unified Agreement Storage
```sql
-- New unified table structure
pod_agreements {
  id: uuid PRIMARY KEY,
  pod_id: uuid REFERENCES pods(id),
  agreement_type: enum('leadership_accountability', 'membership_requirement', 'role_specific'),
  role_name: text NULL, -- NULL for pod-wide agreements
  title: text NOT NULL,
  content: text NOT NULL,
  version: integer DEFAULT 1,
  is_active: boolean DEFAULT true,
  created_by: text NOT NULL,
  created_at: timestamp DEFAULT now(),
  updated_at: timestamp DEFAULT now()
}

-- Enhanced signatures table
pod_agreement_signatures {
  id: uuid PRIMARY KEY,
  agreement_id: uuid REFERENCES pod_agreements(id),
  signer_address: text NOT NULL,
  signature_data: text NOT NULL,
  accountability_statement: text, -- User's personal commitment
  signed_at: timestamp DEFAULT now(),
  is_valid: boolean DEFAULT true
}
```

### 2. Unified Agreement Flow

#### A. Agreement Creation (Pod Management)
```
Pod Management → Role Settings → Add Eligibility Criteria → Agreement Type
  ↓
Select Agreement Type:
  - Leadership Accountability (for pod leaders)
  - Membership Requirement (for new members) 
  - Role-Specific Agreement (for specific roles)
  ↓
Agreement Text:
  - Pre-populate with existing pod agreement if available
  - Allow customization per role
  - Auto-save to unified pod_agreements table
```

#### B. Agreement Signing (User Flow)
```
Pod Page → Check Required Agreements → Show Unified Signing Interface
  ↓
Required Agreements Display:
  - Leadership Accountability (if user is/becomes leader)
  - Membership Requirements (if applying/joining)
  - Role-Specific (if has/applying for specific role)
  ↓
Unified Signing Modal:
  - Show all required agreements
  - Single signature covers all requirements
  - Record in pod_agreement_signatures
```

### 3. Technical Integration Points

#### A. Enhanced useAccountability Hook
```typescript
useAccountability({
  podId: string,
  userAddress?: string,
  roleRequirements?: string[] // Add role-specific agreements
})
```

#### B. Enhanced EligibilityService
```typescript
// Check if user has signed required agreements
evaluateAgreementSigned(userAddress, criterion) {
  // Look up agreement by ID from criterion
  // Check pod_agreement_signatures for user signature
  // Return pass/fail with agreement details
}
```

#### C. Pod Management Integration
```typescript
// When editing eligibility criteria
getExistingPodAgreements(podId) {
  // Return list of existing agreements for this pod
  // Allow selection or creation of new agreement
  // Auto-populate agreement text field
}
```

## Implementation Plan

### Phase 1: Database Migration
1. Create unified `pod_agreements` table
2. Migrate existing accountability data
3. Update eligibility criteria to reference agreement IDs

### Phase 2: UI Integration  
1. Update eligibility criteria builder to show existing agreements
2. Add agreement selection/creation flow
3. Enhance accountability signing to use unified agreements

### Phase 3: Validation Integration
1. Update EligibilityService to check unified signatures
2. Enhance pod page to show all required agreements
3. Create unified signing modal

## Benefits

✅ **Single Source of Truth**: All pod agreements in one place
✅ **Reusable Agreements**: Same agreement can be used for multiple roles
✅ **Versioning**: Track agreement changes over time
✅ **Unified Signing**: Users sign once for all requirements
✅ **Better UX**: Clear view of all requirements
✅ **Maintainable**: Single system to manage vs scattered logic