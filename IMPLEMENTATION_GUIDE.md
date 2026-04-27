# Group & Club Chat Implementation Guide

## Overview

This guide covers the integration of Group Chat and Club Chat functionality into the CampusLink application. The implementation follows a strict membership-based visibility model where users can only see messages sent during their membership window.

## Architecture

### Core Components

1. **chatMembership.ts** - Message visibility and membership window management
2. **chatPermissions.ts** - Role-based permission checking
3. **chatSystemEvents.ts** - System message generation for membership changes
4. **groupChat.ts** - Independent group chat operations
5. **clubChatSync.ts** - Club ↔ Chat membership synchronization
6. **groupChat.ts (routes)** - API endpoints for group operations

### Database Changes

- Added `message_sequence` (BigInt) to `messages` table for monotonic ordering
- Added `description`, `group_metadata` (JSON) to `chats` table
- Added `group_add_preference` (VARCHAR) to `user_settings` table
- Created indices for efficient querying

## Integration Steps

### Step 1: Register New Routes

In your main server file (e.g., `backend/server/src/index.ts`), import and mount the group chat router:

```typescript
import groupChatRouter from './routes/groupChat';

app.use('/api/group-chat', groupChatRouter);
```

### Step 2: Update Club Management Endpoints

When users join/leave clubs or change roles, call the sync functions:

**When user joins club (in club membership endpoint):**

```typescript
import { onUserJoinedClub } from '../lib/clubChatSync';

// After adding user to club
await onUserJoinedClub(userId, clubId, clubName, roleInClub);
```

**When user leaves club:**

```typescript
import { onUserLeftClub } from '../lib/clubChatSync';

// After updating membership to LEFT
await onUserLeftClub(userId, clubId);
```

**When user's club role changes:**

```typescript
import { onUserClubRoleChanged } from '../lib/clubChatSync';

// After updating role
await onUserClubRoleChanged(userId, clubId, newRole);
```

**When club is deleted:**

```typescript
import { onClubDeleted } from '../lib/clubChatSync';

// Before or after deleting club
await onClubDeleted(clubId);
```

### Step 3: Update Existing Chat Routes

The existing chat fetch endpoints should enforce membership-based visibility. Update message fetching to use the membership filter:

**Before (old approach - UNSAFE):**

```typescript
const messages = await prisma.$queryRaw`
  SELECT * FROM messages
  WHERE chat_id = ${chatId}
  ORDER BY created_at DESC
`;
```

**After (new approach - SAFE):**

```typescript
import { getVisibleMessagesForUser, validateChatAccess } from '../lib/chatMembership';

// First, validate user can access this chat
await validateChatAccess(userId, chatId);

// Then get only visible messages
const messages = await getVisibleMessagesForUser(
  userId,
  chatId,
  limit,
  offset,
);
```

### Step 4: Update Message Sending

When sending a message, ensure user is an active member:

```typescript
import { validateActiveChatAccess } from '../lib/chatMembership';
import { checkChatPermission, ChatPermission } from '../lib/chatPermissions';

// Validate active membership
await validateActiveChatAccess(userId, chatId);

// Check permission to send
await checkChatPermission(userId, chatId, ChatPermission.SEND_MESSAGE);

// Then persist and broadcast
```

### Step 5: Update Unread Counts

When calculating unread counts, use the membership-aware function:

```typescript
import { getUnreadCountForUser } from '../lib/chatMembership';

const unreadCount = await getUnreadCountForUser(userId, chatId);
```

### Step 6: Setup User Settings

Ensure user settings are initialized with the group add preference:

```typescript
// When creating user settings, set default
INSERT INTO user_settings (user_id, group_add_preference)
VALUES (${userId}, 'everyone');
```

## API Reference

### Group Chat Endpoints

#### Create Group Chat

```
POST /api/group-chat/create

Request Body:
{
  "name": "Study Group",
  "description": "CSE students studying together",
  "memberIds": ["user-id-1", "user-id-2"]
}

Response:
{
  "chatId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### Add Member

```
POST /api/group-chat/:chatId/add-member

Request Body:
{
  "userId": "target-user-id",
  "role": "MEMBER" // or "ADMIN"
}

Response:
{ "success": true }
```

#### Remove Member

```
POST /api/group-chat/:chatId/remove-member

Request Body:
{
  "userId": "target-user-id",
  "reason": "Violation of group rules" // optional
}

Response:
{ "success": true }
```

#### Leave Group

```
POST /api/group-chat/:chatId/leave

Response:
{ "success": true }
```

#### Change Member Role

```
POST /api/group-chat/:chatId/change-role

Request Body:
{
  "userId": "target-user-id",
  "newRole": "ADMIN"
}

Response:
{ "success": true }
```

#### Update Group Settings

```
PUT /api/group-chat/:chatId

Request Body:
{
  "name": "New Name",
  "description": "Updated description",
  "avatarUrl": "https://..."
}

Response:
{ "success": true }
```

#### Delete Group

```
DELETE /api/group-chat/:chatId

Response:
{ "success": true }
```

#### Get Members

```
GET /api/group-chat/:chatId/members

Response:
{
  "members": [
    {
      "user_id": "xxx",
      "username": "alice",
      "role": "owner",
      "joined_at": "2026-04-27T...",
      "left_at": null
    }
  ]
}
```

## Core Functions Reference

### Membership & Visibility

```typescript
// Check if user can access a message
canAccessMessage(userId, messageId): Promise<boolean>

// Get visible messages for user (respects membership window)
getVisibleMessagesForUser(userId, chatId, limit, offset): Promise<Message[]>

// Calculate unread count for user
getUnreadCountForUser(userId, chatId): Promise<number>

// Validate user is/was a member
validateChatAccess(userId, chatId): Promise<void>

// Validate user is an ACTIVE member
validateActiveChatAccess(userId, chatId): Promise<void>

// Get user's membership window
getMembershipWindow(userId, chatId): Promise<MembershipWindow|null>
```

### Permissions

```typescript
// Check if user has specific permission
checkChatPermission(userId, chatId, permission, clubId?): Promise<void>

// Get user's role in chat
getUserChatRole(userId, chatId): Promise<ChatParticipantRole|null>

// Get user's role in club (for club chats)
getUserClubRole(userId, clubId): Promise<string|null>
```

### Group Operations

```typescript
// Create new group
createGroupChat(creatorId, name, description?, memberIds?): Promise<string>

// Add user to group
addUserToChat(actorId, targetId, chatId, role?): Promise<void>

// Remove user from group
removeUserFromChat(actorId, targetId, chatId, reason?): Promise<void>

// Change user's role
changeUserRole(actorId, targetId, chatId, newRole): Promise<void>

// Update group settings
updateGroupChat(actorId, chatId, updates): Promise<void>

// Delete group
deleteGroupChat(actorId, chatId): Promise<void>

// Get members
getChatMembers(chatId, includeInactive?): Promise<Member[]>
```

### Club Sync

```typescript
// Get or create club chat
getOrCreateClubChat(clubId, clubName): Promise<string>

// Called when user joins club
onUserJoinedClub(userId, clubId, clubName, clubRole): Promise<void>

// Called when user leaves club
onUserLeftClub(userId, clubId): Promise<void>

// Called when club role changes
onUserClubRoleChanged(userId, clubId, newRole): Promise<void>

// Called when club is deleted
onClubDeleted(clubId): Promise<void>
```

### System Events

```typescript
// Create system message
createSystemEvent(chatId, payload): Promise<string>

// Emit join event
emitUserJoined(chatId, userId): Promise<string>

// Emit leave event
emitUserLeft(chatId, userId): Promise<string>

// Emit removal event
emitUserRemoved(chatId, targetId, actorId, reason?): Promise<string>

// Emit role change event
emitUserRoleChanged(chatId, targetId, prevRole, newRole, actorId): Promise<string>
```

## Security Considerations

### Critical Rules

1. **Always validate membership before showing messages**
   - Use `validateChatAccess()` or `canAccessMessage()` on ALL message queries
   - Messages must be filtered based on `joinedAt` and `leftAt` timestamps
   - Former members cannot see messages sent after they left

2. **Check permissions before operations**
   - Use `checkChatPermission()` before add/remove/role changes
   - Verify actor has required role
   - Enforce role hierarchy (OWNER > ADMIN > MEMBER)

3. **Prevent orphaned groups**
   - Check for last admin before allowing demotion
   - Cannot remove last OWNER without reassigning
   - Fail loudly if constraints violated

4. **Respect user preferences**
   - Check `group_add_preference` before adding to independent groups
   - System (club) can override if needed

5. **Cache invalidation**
   - Call `invalidateConversationLists()` after membership changes
   - Ensures clients see updated group lists

## Common Workflows

### Workflow 1: User Joins Club → Auto-added to Chat

```typescript
// In club membership endpoint
router.post('/clubs/:clubId/join', async (req, res) => {
  const userId = req.user.userId;
  
  // Add to club
  const clubMembership = await addClubMember(userId, clubId);
  
  // Auto-add to club chat
  const club = await getClub(clubId);
  await onUserJoinedClub(userId, clubId, club.name, clubMembership.role);
  
  res.json({ success: true });
});
```

### Workflow 2: Create Group with Initial Members

```typescript
// Frontend calls
POST /api/group-chat/create
{
  "name": "Study Group",
  "memberIds": ["user1", "user2", "user3"]
}

// Backend creates group with 3 members + creator as OWNER
// System messages emitted for each join
// All members notified via realtime
```

### Workflow 3: Remove Member Triggers System Event

```typescript
// Admin removes user
POST /api/group-chat/:chatId/remove-member
{
  "userId": "target-user",
  "reason": "Spam"
}

// Backend:
// 1. Validates admin has permission
// 2. Sets leftAt timestamp
// 3. Emits SYSTEM message visible to all current members
// 4. Invalidates both users' conversation lists
// 5. Member no longer sees future messages
```

### Workflow 4: Message Visibility Respects Window

```typescript
// Timeline:
// 2026-04-27 10:00 - Alice joins chat
// 2026-04-27 10:05 - Message "Hello" sent
// 2026-04-27 10:10 - Alice can see "Hello" ✓

// 2026-04-27 10:20 - Bob joins chat
// 2026-04-27 10:25 - Message "Hi Bob" sent
// 2026-04-27 10:30 - Bob can see "Hi Bob" ✓ but NOT "Hello" ✗

// 2026-04-27 10:35 - Alice leaves chat
// 2026-04-27 10:40 - Message "After Alice left" sent
// 2026-04-27 10:45 - Alice can NOT see "After Alice left" ✗
// 2026-04-27 10:50 - Alice rejoins (new membership window)
// 2026-04-27 10:55 - Message "Welcome back" sent
// 2026-04-27 11:00 - Alice can see "Welcome back" ✓ (from this new join time)
```

## Testing Checklist

- [ ] User can create group chat
- [ ] User can add/remove members
- [ ] Members see messages only during membership window
- [ ] Former members cannot see new messages after leaving
- [ ] Rejoin creates new membership window (no retroactive access)
- [ ] System messages appear for join/leave/remove/role_change
- [ ] Permissions properly enforced
- [ ] Club join auto-adds to chat
- [ ] Club leave removes from chat
- [ ] Club role change updates chat role
- [ ] Club deletion removes chat
- [ ] Unread counts respect membership window
- [ ] Pagination works with large groups
- [ ] Concurrent operations don't break ordering
- [ ] User preferences honored for group adds

## Migration Path

For existing 1:1 chats:
- No changes needed - they continue to work as before
- `message_sequence` backfilled automatically
- No membership filtering required for direct chats (only 2 people)

For new group chats:
- Use new `/api/group-chat/*` endpoints
- All messages filtered by membership window
- Roles enforced on all operations

For club integration:
- Call sync functions from club membership endpoints
- Chat syncs automatically with club membership
- No manual sync needed by club management
