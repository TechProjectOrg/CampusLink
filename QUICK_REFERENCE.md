# Quick Reference - Group & Club Chat

## 📦 Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `chatMembership.ts` | 250 | Message visibility & membership windows |
| `chatPermissions.ts` | 220 | Role-based permissions |
| `chatSystemEvents.ts` | 150 | System messages for events |
| `groupChat.ts` | 350 | Group chat operations |
| `clubChatSync.ts` | 280 | Club ↔ Chat sync |
| `routes/groupChat.ts` | 290 | API endpoints |
| Migration SQL | 50 | Database schema updates |
| IMPLEMENTATION_GUIDE.md | 500 | Full integration guide |
| EDGE_CASES_TESTING.md | 450 | Test scenarios |

## 🚀 Quick Start - Integration

### 1. Apply Migration
```bash
cd backend
npx prisma migrate deploy
```

### 2. Register Routes (in server/src/index.ts)
```typescript
import groupChatRouter from './routes/groupChat';
app.use('/api/group-chat', groupChatRouter);
```

### 3. Update Club Endpoints
```typescript
import { onUserJoinedClub, onUserLeftClub, onUserClubRoleChanged, onClubDeleted } from '../lib/clubChatSync';

// On club join
await onUserJoinedClub(userId, clubId, clubName, role);

// On club leave
await onUserLeftClub(userId, clubId);

// On role change
await onUserClubRoleChanged(userId, clubId, newRole);

// On club deletion
await onClubDeleted(clubId);
```

### 4. Update Message Queries
```typescript
// OLD - UNSAFE
const messages = await prisma.$queryRaw`SELECT * FROM messages WHERE chat_id = ${chatId}`;

// NEW - SAFE
import { getVisibleMessagesForUser, validateChatAccess } from '../lib/chatMembership';

await validateChatAccess(userId, chatId);
const messages = await getVisibleMessagesForUser(userId, chatId, 12, 0);
```

### 5. Update Unread Counts
```typescript
// OLD
const count = await countUnread(chatId, userId);

// NEW
import { getUnreadCountForUser } from '../lib/chatMembership';

const count = await getUnreadCountForUser(userId, chatId);
```

## 🔑 Key Functions

### Visibility & Access
```typescript
// Check if user can see a message
await canAccessMessage(userId, messageId) → boolean

// Get visible messages for user
await getVisibleMessagesForUser(userId, chatId, limit, offset) → Message[]

// Get unread count
await getUnreadCountForUser(userId, chatId) → number

// Validate access
await validateChatAccess(userId, chatId) // throws if not member
await validateActiveChatAccess(userId, chatId) // throws if not active
```

### Permissions
```typescript
// Check permission
await checkChatPermission(userId, chatId, ChatPermission.ADD_MEMBER)

// Get user's role
await getUserChatRole(userId, chatId) → "OWNER" | "ADMIN" | "MEMBER" | null

// Prevent last owner removal
await validateRoleChange(userId, chatId, newRole)
```

### Group Operations
```typescript
// Create group
const chatId = await createGroupChat(creatorId, "Group Name", "Description", [userId1, userId2])

// Add member
await addUserToChat(actorId, targetId, chatId, "MEMBER")

// Remove member
await removeUserFromChat(actorId, targetId, chatId)

// Leave
await leaveGroupChat(userId, chatId)

// Change role
await changeUserRole(actorId, targetId, chatId, "ADMIN")

// Update settings
await updateGroupChat(actorId, chatId, { name: "New Name" })

// Delete group
await deleteGroupChat(actorId, chatId)

// Get members
const members = await getChatMembers(chatId)
```

### Club Sync
```typescript
// Auto-create club chat
const chatId = await getOrCreateClubChat(clubId, clubName)

// Called on club join
await onUserJoinedClub(userId, clubId, clubName, role)

// Called on club leave
await onUserLeftClub(userId, clubId)

// Called on role change
await onUserClubRoleChanged(userId, clubId, newRole)

// Called on club deletion
await onClubDeleted(clubId)
```

### System Events
```typescript
// Create event
const msgId = await createSystemEvent(chatId, {
  eventType: SystemEventType.USER_JOINED,
  targetUserId: userId
})

// Helper functions
await emitUserJoined(chatId, userId)
await emitUserLeft(chatId, userId)
await emitUserRemoved(chatId, targetId, actorId, reason)
await emitUserRoleChanged(chatId, targetId, oldRole, newRole, actorId)
```

## 🔐 Security Checks (Always Enforce)

### Before Showing Messages
```typescript
// ✓ Always do this
await validateChatAccess(userId, chatId)
const messages = await getVisibleMessagesForUser(userId, chatId)

// ✗ Never do this
const messages = await getAllMessagesForChat(chatId) // No filter!
```

### Before Operations
```typescript
// ✓ Always do this
await checkChatPermission(userId, chatId, ChatPermission.ADD_MEMBER)

// ✗ Never do this
if (userRole === 'ADMIN') { /* allow */ } // Manual check!
```

### Before Letting Them Send Messages
```typescript
// ✓ Always do this
await validateActiveChatAccess(userId, chatId)
await checkChatPermission(userId, chatId, ChatPermission.SEND_MESSAGE)

// ✗ Never do this
if (await isChatParticipant(userId, chatId)) { /* allow */ } // Ignores leftAt!
```

## 📊 Database Key Tables

### chats
```sql
chat_id (UUID, PK)
chat_type ('direct' | 'group') 
name (VARCHAR, for groups)
description (TEXT)
group_metadata (JSONB)
created_by_user_id (UUID)
is_request (BOOLEAN)
created_at, updated_at
```

### chat_participants
```sql
chat_participant_id (UUID, PK)
chat_id (UUID, FK)
user_id (UUID, FK)
role ('owner' | 'admin' | 'member')
joined_at (TIMESTAMP) ← START of membership window
left_at (TIMESTAMP, nullable) ← END of membership window
last_read_message_id (UUID)
created_at, updated_at

UNIQUE(chat_id, user_id) -- Prevents duplicate memberships
```

### messages
```sql
message_id (UUID, PK)
chat_id (UUID, FK)
sender_user_id (UUID, FK)
message_type ('text' | 'image' | 'file' | 'system')
content (TEXT)
message_sequence (BIGINT) ← Monotonic order within chat
reactions (JSONB)
created_at, updated_at

INDEX(chat_id, message_sequence DESC) -- For ordering
```

### user_settings
```sql
user_id (UUID, PK)
group_add_preference ('everyone' | 'friends' | 'none')
[other fields...]
```

## 🧪 Testing Essentials

### Must Test
- [ ] User cannot see messages before joining
- [ ] User cannot see messages after leaving
- [ ] Rejoin creates new window (no retroactive access)
- [ ] Permissions enforced on all operations
- [ ] Last owner cannot be removed
- [ ] System events visible to eligible members
- [ ] Club join auto-adds to chat
- [ ] Club leave removes from chat
- [ ] Concurrent adds don't duplicate
- [ ] Pagination consistent

### Edge Cases (See EDGE_CASES_TESTING.md)
- [ ] Very large chats (1000+ members)
- [ ] Concurrent operations
- [ ] Pagination during new messages
- [ ] Rapid role changes
- [ ] Club deletion during activity
- [ ] Cache invalidation

## 🐛 Common Issues

### "User cannot see message"
```typescript
// Check these in order:
1. await validateChatAccess(userId, chatId) // Are they a member?
2. await canAccessMessage(userId, messageId) // Within membership window?
3. const member = await getMembershipWindow(userId, chatId) // Check joinedAt/leftAt
```

### "Role change didn't take effect"
```typescript
// Remember to:
1. Call invalidateConversationLists(userId) after role change
2. Wait for cache to expire (TTL: 2-10 min)
3. Verify database update: SELECT * FROM chat_participants WHERE ...
```

### "Club chat not syncing"
```typescript
// Ensure called from club endpoints:
1. Club join → onUserJoinedClub()
2. Club leave → onUserLeftClub()
3. Club role change → onUserClubRoleChanged()
4. Club delete → onClubDeleted()
```

## 📈 Performance Tips

- **Large chats**: Use `message_sequence` for ordering (O(1))
- **Unread counts**: Cached, invalidate on read state change
- **Conversation list**: Cached 2 min, invalidate on membership change
- **Message fetch**: Pagination with cursor, limit 12-50 per page
- **Permissions**: O(1) via role lookup, no recursive checks

## 🎯 Next Steps

1. **Today**: Review code, apply migration, register routes
2. **Tomorrow**: Update club endpoints, update message queries
3. **This week**: Integration testing, edge case testing
4. **Next week**: Performance testing, deployment
