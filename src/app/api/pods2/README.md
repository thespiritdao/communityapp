# Pods2 API Documentation

**Blockchain-First Architecture** - Database is cache/index only. All permissions read directly from Hats Protocol.

## Base URL
```
/api/pods2
```

## Authentication
Most endpoints require authentication via session/JWT. Public read access is available for listing active pods.

## Endpoints

### 1. List Pods
**GET** `/api/pods2`

Get a list of all pods with optional filters.

**Query Parameters:**
- `status` (string, optional): Filter by status (`active`, `inactive`). Default: `active`
- `creator` (address, optional): Filter by creator address
- `limit` (number, optional): Number of results. Default: 50
- `offset` (number, optional): Pagination offset. Default: 0

**Response:**
```json
{
  "pods": [
    {
      "id": "uuid",
      "podIdHash": "0x...",
      "name": "My Pod",
      "description": "Pod description",
      "imageUri": "ipfs://...",
      "tophatId": "12345...",
      "adminHatId": "12346...",
      "memberHatId": "12347...",
      "creatorAddress": "0x...",
      "leaderAddresses": ["0x...", "0x..."],
      "status": "active",
      "isLinkedTree": true,
      "createdAt": "2025-01-15T...",
      "adminCount": 3,
      "memberCount": 25,
      "totalMembers": 28
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### 2. Create Pod
**POST** `/api/pods2`

Sync a newly created pod to the database after on-chain creation.

**Important:** Client must send the transaction first, then call this endpoint with the transaction hash.

**Request Body:**
```json
{
  "transactionHash": "0x...",
  "expectedPodData": {
    "name": "My Pod",
    "leaders": ["0x..."]
  }
}
```

**Response:**
```json
{
  "success": true,
  "pod": {
    "id": "uuid",
    "podIdHash": "0x...",
    "name": "My Pod",
    "topHatId": "12345...",
    "adminHatId": "12346...",
    "memberHatId": "12347...",
    "transactionHash": "0x...",
    "blockNumber": "12345678"
  }
}
```

**Flow:**
1. Client calls PodFactoryV2 contract `createPod()` function
2. Client waits for transaction confirmation
3. Client calls this API with transaction hash
4. API verifies transaction, decodes event, syncs to database

---

### 3. Get Pod Details
**GET** `/api/pods2/[id]`

Get detailed information about a specific pod.

**Path Parameters:**
- `id`: Pod UUID or podIdHash (bytes32)

**Query Parameters:**
- `verify` (boolean, optional): Verify data against blockchain. Default: false

**Response:**
```json
{
  "pod": {
    "id": "uuid",
    "podIdHash": "0x...",
    "name": "My Pod",
    "description": "Pod description",
    "imageUri": "ipfs://...",
    "tophatId": "12345...",
    "adminHatId": "12346...",
    "memberHatId": "12347...",
    "creatorAddress": "0x...",
    "leaderAddresses": ["0x...", "0x..."],
    "status": "active",
    "isLinkedTree": true,
    "createdAt": "2025-01-15T...",
    "lastSyncedAt": "2025-01-15T...",
    "admins": [
      {
        "address": "0x...",
        "joinedAt": "2025-01-15T...",
        "isEligible": true,
        "inGoodStanding": true
      }
    ],
    "members": [...],
    "adminCount": 3,
    "memberCount": 25,
    "totalMembers": 28
  },
  "blockchainData": {
    "status": "active",
    "leaderCount": 3
  }
}
```

---

### 4. Update Pod Status
**PATCH** `/api/pods2/[id]`

Update pod status in database cache after on-chain status change.

**Request Body:**
```json
{
  "transactionHash": "0x...",
  "updateType": "status"
}
```

**Response:**
```json
{
  "success": true,
  "pod": {
    "id": "uuid",
    "status": "inactive",
    "lastSyncedAt": "2025-01-15T..."
  }
}
```

---

### 5. List Pod Members
**GET** `/api/pods2/[id]/members`

Get all members of a pod.

**Query Parameters:**
- `role` (string, optional): Filter by role (`admin`, `member`)
- `verify` (boolean, optional): Verify each member on-chain. Default: false

**Response:**
```json
{
  "pod": {
    "id": "uuid",
    "name": "My Pod",
    "adminHatId": "12346...",
    "memberHatId": "12347..."
  },
  "members": [
    {
      "address": "0x...",
      "role": "admin",
      "hatId": "12346...",
      "joinedAt": "2025-01-15T...",
      "lastVerifiedAt": "2025-01-15T...",
      "cached": {
        "isActive": true,
        "isEligible": true,
        "inGoodStanding": true
      },
      "onChain": {
        "isWearer": true,
        "isEligible": true,
        "inGoodStanding": true,
        "hasAccess": true
      }
    }
  ],
  "total": 28
}
```

---

### 6. Add Member
**POST** `/api/pods2/[id]/members`

Sync member addition after on-chain hat mint.

**Request Body:**
```json
{
  "transactionHash": "0x...",
  "memberAddress": "0x...",
  "role": "member"
}
```

**Response:**
```json
{
  "success": true,
  "member": {
    "address": "0x...",
    "role": "member",
    "hatId": "12347...",
    "isActive": true,
    "isEligible": true,
    "inGoodStanding": true,
    "transactionHash": "0x..."
  }
}
```

**Flow:**
1. Pod admin calls Hats Protocol `mintHat()` function
2. Transaction confirmed
3. Client calls this API with transaction hash
4. API verifies member has hat, syncs to database

---

### 7. Remove Member
**DELETE** `/api/pods2/[id]/members`

Mark member as inactive after on-chain hat revocation.

**Request Body:**
```json
{
  "memberAddress": "0x...",
  "verifyOnChain": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Member marked as inactive",
  "address": "0x..."
}
```

---

### 8. Check Permissions
**GET** `/api/pods2/[id]/permissions?address=0x...`

Check what permissions a user has in a pod.

**Query Parameters:**
- `address` (address, required): User's wallet address
- `useCache` (boolean, optional): Use cached data. Default: true

**Response:**
```json
{
  "pod": {
    "id": "uuid",
    "name": "My Pod",
    "adminHatId": "12346...",
    "memberHatId": "12347..."
  },
  "user": {
    "address": "0x...",
    "permissions": {
      "level": "admin",
      "canManagePod": true,
      "canManageMembers": true,
      "canCreateEvents": true,
      "canManageTreasury": true,
      "canCreateProposals": true,
      "canCreateThreads": true,
      "canModerateContent": true,
      "hasAccess": true
    },
    "cached": {
      "level": "admin",
      "hasAccess": true,
      "lastVerified": "2025-01-15T..."
    },
    "blockchain": {
      "admin": {
        "isWearer": true,
        "isEligible": true,
        "inGoodStanding": true,
        "hasAccess": true
      },
      "member": {
        "isWearer": false,
        "isEligible": false,
        "inGoodStanding": true,
        "hasAccess": false
      },
      "effectiveRole": "admin"
    }
  }
}
```

---

### 9. Batch Check Permissions
**POST** `/api/pods2/[id]/permissions/batch`

Check permissions for multiple users at once.

**Request Body:**
```json
{
  "addresses": ["0x...", "0x...", "0x..."]
}
```

**Response:**
```json
{
  "pod": {
    "id": "uuid",
    "name": "My Pod"
  },
  "results": [
    {
      "address": "0x...",
      "isAdmin": true,
      "isMember": false,
      "permissions": { ... }
    }
  ],
  "total": 3
}
```

---

### 10. Sync All Pods
**POST** `/api/pods2/sync`

Full sync of all pods from blockchain events.

**Request Body:**
```json
{
  "fromBlock": "12345678",
  "toBlock": "12345999",
  "fullResync": false
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalEvents": 15,
    "successCount": 14,
    "errorCount": 1,
    "fromBlock": "12345678",
    "toBlock": "12345999"
  },
  "results": [
    {
      "podId": "0x...",
      "name": "My Pod",
      "success": true,
      "dbId": "uuid"
    }
  ]
}
```

---

### 11. Sync Pod Members
**PUT** `/api/pods2/sync/members`

Verify and update all members for a specific pod.

**Request Body:**
```json
{
  "podId": "uuid",
  "fromBlock": "12345678"
}
```

**Response:**
```json
{
  "success": true,
  "pod": {
    "id": "uuid",
    "name": "My Pod"
  },
  "summary": {
    "totalMembers": 28,
    "verified": 27,
    "errors": 1
  },
  "members": [
    {
      "address": "0x...",
      "role": "admin",
      "isWearer": true,
      "isEligible": true,
      "inGoodStanding": true
    }
  ],
  "errors": [
    {
      "address": "0x...",
      "error": "RPC timeout"
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (missing parameters, invalid data)
- `404` - Not Found (pod doesn't exist)
- `500` - Internal Server Error

---

## Permission Matrix

### Admin Hat Holders
- `canManagePod`: ✅ true
- `canManageMembers`: ✅ true
- `canCreateEvents`: ✅ true
- `canManageTreasury`: ✅ true
- `canCreateProposals`: ✅ true
- `canCreateThreads`: ✅ true
- `canModerateContent`: ✅ true

### Member Hat Holders
- `canManagePod`: ❌ false
- `canManageMembers`: ❌ false
- `canCreateEvents`: ❌ false
- `canManageTreasury`: ❌ false
- `canCreateProposals`: ✅ true
- `canCreateThreads`: ✅ true
- `canModerateContent`: ❌ false

### No Hat
- All permissions: ❌ false

---

## Architecture Notes

1. **Blockchain-First**: Database is just a cache. All permission checks read from Hats Protocol.

2. **Transaction Flow**: Client sends transactions, then notifies API for database sync.

3. **No Governance**: Pods are created immediately, no approval needed.

4. **Caching Strategy**: Database caches blockchain state for performance, but can be verified on-demand.

5. **Sync Logging**: All sync operations are logged in `pod_sync_log2` table.

---

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS=0x...
POD_FACTORY_V2_DEPLOYMENT_BLOCK=12345678
```

---

## Example Usage

### Create a Pod (Full Flow)

```typescript
import { useContractWrite, useWaitForTransaction } from 'wagmi';

// 1. Send transaction
const { write, data: txData } = useContractWrite({
  address: POD_FACTORY_V2_ADDRESS,
  abi: PodFactoryABI,
  functionName: 'createPod',
  args: [name, description, imageUri, leaders],
});

// 2. Wait for confirmation
const { isSuccess } = useWaitForTransaction({
  hash: txData?.hash,
});

// 3. Sync to database
if (isSuccess) {
  const response = await fetch('/api/pods2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionHash: txData.hash,
      expectedPodData: { name, leaders },
    }),
  });

  const { pod } = await response.json();
  console.log('Pod created:', pod);
}
```

### Check User Permissions

```typescript
const response = await fetch(
  `/api/pods2/${podId}/permissions?address=${userAddress}&useCache=true`
);

const { user } = await response.json();

if (user.permissions.canManagePod) {
  // Show admin UI
} else if (user.permissions.canCreateProposals) {
  // Show member UI
} else {
  // Show public UI
}
```
