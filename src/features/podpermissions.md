# Pod Role-Based Permissions Best Practices

## Overview

Our DAO application implements a hybrid role-based access control (RBAC) system that combines:
- **Database-stored permissions** (Supabase) for fast access control
- **On-chain HAT verification** (Hats Protocol) for trustless role validation
- **Dynamic permission checking** for real-time access control

## Permission Architecture

### Core Components

1. **`HatPermissions` Interface** - Defines available permissions
2. **`PodRolePermissionsService`** - Database operations for role permissions
3. **`useHatPermissions` Hook** - React hook for permission checking
4. **`podAuthMiddleware`** - API route protection
5. **`HatGatedChatContainer`** - Example gated feature implementation

### Permission Types

```typescript
export interface HatPermissions {
  chatAccess: boolean;                 // Chat participation
  governanceParticipation: boolean;    // Voting and proposals  
  eventCreation: boolean;              // Event management
  treasuryViewing: boolean;           // Treasury access
  memberManagement: boolean;          // User management
  subPodCreation: boolean;            // Pod creation
  roleAssignment: boolean;            // Role management
  forumModeration: boolean;           // Forum moderation
  bountyManagement: boolean;          // Bounty operations
  marketplaceAccess: boolean;         // Marketplace features
}
```

## Implementation Best Practices

### 1. Frontend Permission Checking

**✅ DO:** Use the `useHatPermissions` hook for React components

```tsx
import { useHatPermissions } from '@/hooks/useHatPermissions';

export const MyComponent = () => {
  const { 
    canAccessChat, 
    canCreateEvents, 
    isPodLeader,
    userRoles,
    hasHat
  } = useHatPermissions();

  if (!canAccessChat) {
    return <AccessDenied />;
  }

  return (
    <div>
      {canCreateEvents && <CreateEventButton />}
      {isPodLeader && <AdminPanel />}
    </div>
  );
};
```

**❌ DON'T:** Hardcode permission checks or bypass the hook system

### 2. API Route Protection

**✅ DO:** Use the pod authentication middleware

```typescript
// pages/api/events/create.ts
import { withPodAuth } from '@/features/pods/middleware/podAuthMiddleware';

const handler = withPodAuth(async (req, res, authContext) => {
  const { permissions, accessLevel } = authContext;
  
  if (!permissions?.eventCreation) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  // Handle event creation
}, ['eventCreation']);

export default handler;
```

**❌ DON'T:** Skip authentication or implement custom auth logic

### 3. Database Permission Updates

**✅ DO:** Use the service layer for permission management

```typescript
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';

// Update role permissions
const updatePermissions = async (roleId: string, newPermissions: HatPermissions) => {
  try {
    await PodRolePermissionsService.updateRolePermission(roleId, {
      permissions: newPermissions,
      updated_by: userAddress
    });
  } catch (error) {
    console.error('Permission update failed:', error);
  }
};
```

**❌ DON'T:** Direct database queries or bypass service layer

### 4. Gated Feature Implementation

**✅ DO:** Follow the HatGatedChatContainer pattern

```tsx
export const GatedFeature = ({ requiredPermission, podId }) => {
  const { address } = useAccount();
  const { checkUserEligibility } = useEligibility();
  const { [requiredPermission]: hasPermission } = useHatPermissions();

  useEffect(() => {
    const verifyAccess = async () => {
      if (!hasPermission) {
        setAccessDenied(true);
        return;
      }
      
      // Additional eligibility checks if needed
      if (podId) {
        const eligible = await checkUserEligibility(podId, address);
        setAccessDenied(!eligible);
      }
    };
    
    verifyAccess();
  }, [hasPermission, podId, address]);

  if (accessDenied) {
    return <PermissionDenied requiredPermission={requiredPermission} />;
  }

  return <FeatureContent />;
};
```

## Permission Hierarchy

### Role Types
1. **Pod Leader** - Full permissions within their pod
2. **Pod Member** - Configurable subset of permissions
3. **Guest** - Read-only or no access

### Permission Levels
1. **View** - Read access only
2. **Participate** - Create/interact with content
3. **Manage** - Modify/delete content
4. **Admin** - Full control including permissions

## Security Considerations

### 1. Defense in Depth
- ✅ Frontend UI hiding (UX)
- ✅ API route protection (Security)
- ✅ Database RLS policies (Data integrity)
- ✅ On-chain HAT verification (Trustless validation)

### 2. Permission Sync
- Database permissions are the source of truth for UI/API
- HAT ownership is verified on-chain for critical operations
- Sync status tracked in `pod_role_permissions.sync_status`

### 3. Error Handling
```typescript
// Graceful degradation
const { permissions, error } = useHatPermissions();

if (error) {
  console.error('Permission check failed:', error);
  // Fall back to most restrictive access
  return <AccessDenied />;
}
```

## Common Patterns

### 1. Multi-Permission Gates
```tsx
const { chatAccess, governanceParticipation } = useHatPermissions();

if (chatAccess && governanceParticipation) {
  return <FullCommunityAccess />;
} else if (chatAccess) {
  return <ChatOnlyAccess />;
} else {
  return <ReadOnlyAccess />;
}
```

### 2. Conditional Feature Display
```tsx
const features = [
  { key: 'chat', component: ChatTab, permission: 'chatAccess' },
  { key: 'events', component: EventsTab, permission: 'eventCreation' },
  { key: 'treasury', component: TreasuryTab, permission: 'treasuryViewing' }
];

return (
  <Tabs>
    {features.map(({ key, component: Component, permission }) => 
      permissions[permission] && (
        <TabPanel key={key}>
          <Component />
        </TabPanel>
      )
    )}
  </Tabs>
);
```

### 3. Progressive Enhancement
```tsx
const MyComponent = () => {
  const { canCreateEvents, canManageEvents } = useHatPermissions();
  
  return (
    <div>
      <EventsList />
      {canCreateEvents && <CreateEventButton />}
      {canManageEvents && <EventManagementPanel />}
    </div>
  );
};
```

## Testing Permissions

### 1. Unit Tests
```typescript
import { renderHook } from '@testing-library/react';
import { useHatPermissions } from '@/hooks/useHatPermissions';

test('should grant chat access to pod members', async () => {
  const { result } = renderHook(() => useHatPermissions(), {
    wrapper: MockHatProvider
  });
  
  expect(result.current.canAccessChat).toBe(true);
});
```

### 2. Integration Tests
```typescript
import { testApiRoute } from '@/test-utils';

test('should protect events API with proper permissions', async () => {
  const response = await testApiRoute('/api/events/create', {
    method: 'POST',
    headers: { 'x-wallet-address': '0x123...' }
  });
  
  expect(response.status).toBe(403);
});
```

## Troubleshooting

### Common Issues

1. **Permission denied despite HAT ownership**
   - Check database sync status
   - Verify RLS policies
   - Check for stale permission cache

2. **Slow permission checks**
   - Implement permission caching
   - Use React Query for permission state
   - Optimize database queries

3. **Inconsistent permissions**
   - Ensure proper error handling
   - Implement permission refresh mechanism
   - Check for concurrent permission updates

### Debugging
```typescript
const { permissions, userRoles, userHats } = useHatPermissions();

console.log('Permission Debug:', {
  permissions,
  userRoles,
  userHats,
  address: account.address
});
```

## Migration Guidelines

### Adding New Permissions
1. Add to `HatPermissions` interface
2. Update default role configurations
3. Add to UI permission toggles
4. Implement feature-specific checks
5. Update API route protection

### Removing Permissions
1. Remove from feature implementations
2. Update database cleanup migration
3. Remove from UI components
4. Update documentation

---

**Remember:** Always test permission changes in development before deploying to production. The permission system is critical for security and user experience.