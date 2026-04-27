# Edge Cases & Testing Guide

## Edge Cases Overview

This document outlines critical edge cases that MUST be tested to ensure the group/club chat system is robust and secure.

## Category 1: Membership Window Edge Cases

### Case 1.1: User Joins Before First Message

```
Timeline:
- 10:00 - User A joins chat
- 10:05 - User A sends first message
Expected: User A can see message ✓
Test: canAccessMessage(userId, messageId) returns true
```

### Case 1.2: User Joins After Messages Exist

```
Timeline:
- 10:00 - User A sends messages (User B not in chat)
- 10:05 - User B joins chat
- 10:10 - User B requests messages
Expected: User B cannot see 10:00 messages ✓
Test: getVisibleMessagesForUser returns only messages after 10:05
```

### Case 1.3: User Leaves Mid-Conversation

```
Timeline:
- 10:00 - User A joins
- 10:05 - Message sent
- 10:10 - User A leaves (leftAt = 10:10)
- 10:15 - New message sent
- 10:20 - User A queries messages
Expected: User A sees message from 10:05 but NOT 10:15 ✓
Test: Query uses both joinedAt AND leftAt constraints
```

### Case 1.4: User Rejoins After Leaving

```
Timeline:
- 10:00 - User A joins (membership #1)
- 10:05 - Message sent (User A can see)
- 10:10 - User A leaves (membership #1 has leftAt)
- 10:15 - User A rejoins (membership #2, new record)
- 10:20 - Message sent
- 10:25 - User A queries
Expected: User A can see 10:20 but NOT 10:05 (retroactive access denied) ✓
Note: This is critical - each join is a separate window!
Test: Query finds newest membership window only
Implementation: New ChatParticipant row each rejoin
```

### Case 1.5: Very Large Chat (1000+ members)

```
Scenario: Chat with 1000 members
Expected: Queries still fast
Test: Message fetch with <100ms latency
Optimization: Use messageSequence index (chat_id, message_sequence DESC)
```

### Case 1.6: Concurrent Joins

```
Scenario: Users join simultaneously
Timeline (in milliseconds):
- 10:00.000 - User A joins
- 10:00.001 - User B joins
- 10:00.002 - User C joins
Expected: All successfully added, no duplicates
Test: Ensure uq_chat_participants_chat_id_user_id prevents duplicates
```

## Category 2: Pagination Edge Cases

### Case 2.1: Pagination Cursor Before User Joined

```
Scenario: 
- User joins at 10:10
- Cursor points to message at 10:05 (before join)
- User requests messages before cursor
Expected: Query uses MAX(cursor_time, joined_at)
Result: No messages returned (cursor is before join)
Test: Fetch with before=old_message_id returns empty
```

### Case 2.2: New Messages During Pagination

```
Scenario:
- User loads page 1 (messages 10:00-10:05)
- New message arrives at 10:03 (between pages)
- User loads page 2 (messages before 10:00)
Expected: Consistent ordering, no duplicates across pages
Test: messageSequence ensures consistent ordering
Note: Timestamp alone could cause issues - sequence number prevents it
```

### Case 2.3: Pagination at Chat Boundary

```
Scenario:
- Chat has exactly 12 messages (= CHAT_PAGE_DEFAULT_LIMIT)
- User requests page with limit=12
Expected: hasMore=false (no more messages)
Test: Verify hasMore calculation
```

## Category 3: Permission Edge Cases

### Case 3.1: Last Owner Demotion Prevention

```
Scenario:
- Group has 1 OWNER (User A)
- User A tries to demote self to MEMBER
Expected: REJECTED with clear error message
Test: changeUserRole throws "Cannot demote last owner"
Implementation: Count active OWNERs before allowing demotion
```

### Case 3.2: Non-Owner Cannot Add Members

```
Scenario:
- User B is MEMBER in group
- User B tries to add User C
Expected: PERMISSION_DENIED
Test: checkChatPermission rejects
```

### Case 3.3: Permission Inheritance via Club Role

```
Scenario:
- Club ADMIN (not OWNER) joins club chat
- Tries to remove member
Expected: ALLOWED (club admin can manage)
Test: Club role overrides chat role for permissions
```

### Case 3.4: Removed User Cannot Add Self Back

```
Scenario:
- User A removed from group
- User A tries to add self back
Expected: PERMISSION_DENIED (not a member)
Test: validateActiveChatAccess fails for removed users
```

## Category 4: System Events Edge Cases

### Case 4.1: System Events Respect Membership Window

```
Scenario:
- 10:00 - User A joins
- 10:05 - System message "User B joined" (User A was already there)
- 10:10 - User C joins
Expected:
- User A can see join message about User B ✓
- User C can see join message about self ✓
- User C cannot see User B's join (happened at 10:05, C joined 10:10) ✓
Test: System events subject to same visibility rules as regular messages
```

### Case 4.2: Rapid Role Changes Generate Multiple Events

```
Scenario:
- 10:00 - User A promoted to ADMIN
- 10:01 - User A promoted to OWNER
- 10:02 - User A demoted to MEMBER
Expected: Three system messages in timeline
Test: All three events visible to other members
```

### Case 4.3: Removal Event Visible Before Removal

```
Scenario:
- 10:00 - User A removed by admin
Expected:
- System message "User A was removed" appears at 10:00
- User A cannot see any messages after 10:00 (leftAt set)
- Other members see removal message
Test: leftAt timestamp = message creation time
```

## Category 5: Caching Edge Cases

### Case 5.1: Cache Invalidation After Add

```
Scenario:
- User A's conversation list cached (doesn't include new group)
- User B adds User A to group
- User A checks conversation list
Expected: New group appears (cache invalidated)
Test: invalidateConversationLists called during add
Implementation: Cache TTL respected, or explicit invalidation
```

### Case 5.2: Recent Message Cache Across Joins

```
Scenario:
- Chat has recent messages (cached)
- User joins (creates new membership)
- User fetches messages
Expected: Cache respects new membership window
Test: getVisibleMessagesForUser filters by membership even with cache
```

### Case 5.3: Read State Cache After Leave/Rejoin

```
Scenario:
- User A reads messages up to #5
- User A leaves (read state cached)
- User A rejoins
- New messages #6, #7 created
Expected: Unread count = 2 (not 0)
Test: Read state per membership, not per user
```

## Category 6: Club Chat Sync Edge Cases

### Case 6.1: Club Chat Auto-Creation

```
Scenario:
- Club created but no chat yet
- First user joins club
Expected: Chat auto-created
Test: getOrCreateClubChat returns same ID on second call
```

### Case 6.2: Club Role Change During Activity

```
Scenario:
- User is MEMBER in club+chat
- User promoted to ADMIN in club
- User immediately sends message
Expected:
- Chat role updated to ADMIN
- Message sent with new role
Test: No race condition, permissions consistent
```

### Case 6.3: Club Deletion During Active Chat

```
Scenario:
- Club chat has 50 active members
- Club deleted
Expected: Chat deleted, all members notified
Test: cascade delete works, conversation lists invalidated
```

### Case 6.4: User Joins Club → Joins Chat → Leaves Club → Rejoins

```
Timeline:
1. User A joins Club X → joins Club Chat X (membership #1)
2. Messages sent (User A can see)
3. User A leaves Club X → removed from Chat X (leftAt set)
4. Messages sent (User A cannot see)
5. User A rejoins Club X → added to Chat X again (membership #2)
6. More messages sent
Expected:
- User A sees messages from period 1-2
- User A doesn't see messages from period 3-4
- User A sees messages from period 5+
Test: Each club join creates new membership window
```

## Category 7: Concurrent Operation Edge Cases

### Case 7.1: Concurrent Add Same User

```
Scenario:
- Two admins simultaneously add User C
- Both send requests at same time
Expected: User C added once (no duplicate membership)
Test: Unique constraint (chat_id, user_id) prevents duplicates
Implementation: ON CONFLICT DO NOTHING
```

### Case 7.2: Add While Remove Pending

```
Scenario:
- Admin A removes User C
- Admin B simultaneously adds User C
- Both operations in flight
Expected: One succeeds, one fails gracefully
Test: Handle constraint violations, return clear error
```

### Case 7.3: Role Change During Leave

```
Scenario:
- Admin changes User A's role to ADMIN
- Simultaneously, User A leaves
Expected: Leave succeeds (set leftAt), role change fails or succeeds
- If role change checks leftAt, it fails (good)
- If it doesn't, role updated but user already left (benign)
Test: Both operations idempotent
```

## Category 8: Data Integrity Edge Cases

### Case 8.1: Message Without Sequence Number

```
Scenario:
- Old messages lack message_sequence (migration incomplete)
- Mixed old + new messages in fetch
Expected: Ordering still correct
Test: Use secondary sort by created_at, message_id
```

### Case 8.2: Orphaned Participant Records

```
Scenario:
- Chat deleted but ChatParticipant cascade pending
- Query checks memberships during cascade
Expected: No orphans, cascade completes
Test: Foreign key constraints enforced
```

### Case 8.3: Invalid Club Link

```
Scenario:
- Club.linked_chat_id points to deleted chat
- User tries to join club
Expected: New chat created, invalid reference cleaned
Test: getOrCreateClubChat handles null/invalid linked_chat_id
```

## Test Categories to Implement

### Unit Tests
```typescript
describe('chatMembership', () => {
  test('canAccessMessage respects joinedAt', () => {});
  test('canAccessMessage respects leftAt', () => {});
  test('getVisibleMessagesForUser filters by window', () => {});
  test('getUnreadCountForUser respects membership', () => {});
});

describe('chatPermissions', () => {
  test('checkChatPermission validates role', () => {});
  test('getUserChatRole returns null if not member', () => {});
  test('validateRoleChange prevents last owner demotion', () => {});
});

describe('groupChat', () => {
  test('createGroupChat sets creator as OWNER', () => {});
  test('addUserToChat prevents duplicates', () => {});
  test('removeUserFromChat sets leftAt', () => {});
  test('changeUserRole enforces permissions', () => {});
});

describe('clubChatSync', () => {
  test('onUserJoinedClub creates chat if needed', () => {});
  test('onUserLeftClub preserves membership history', () => {});
  test('onClubDeleted cascades deletion', () => {});
});
```

### Integration Tests
```typescript
describe('Group Chat E2E', () => {
  test('Full lifecycle: create, add, message, remove', () => {});
  test('Membership window prevents retroactive access', () => {});
  test('System events visible only to eligible members', () => {});
  test('Pagination consistent across joins/leaves', () => {});
});

describe('Club Chat E2E', () => {
  test('Joining club auto-adds to chat', () => {});
  test('Leaving club removes from chat', () => {});
  test('Club role change reflects in chat', () => {});
  test('Rejoining club creates new membership', () => {});
});
```

### Load Tests
```typescript
describe('Performance', () => {
  test('1000-member chat pagination < 100ms', () => {});
  test('Concurrent adds don't create duplicates', () => {});
  test('Message fetch with 10k messages < 200ms', () => {});
});
```

## Manual Testing Checklist

- [ ] Create group, verify creator is OWNER
- [ ] Add multiple members, verify roles assigned
- [ ] Member joins after messages exist, cannot see old messages
- [ ] Member leaves then rejoins, new membership window starts
- [ ] Try to add member when they're already a member (no error)
- [ ] Verify last OWNER cannot be demoted
- [ ] Remove member, verify they can't see new messages
- [ ] System messages appear for join/leave/remove/role_change
- [ ] Join club → appear in club chat
- [ ] Leave club → removed from club chat
- [ ] Rejoin club → can see only messages from this join forward
- [ ] Large pagination (100+ messages) works smoothly
- [ ] Concurrent operations don't create race conditions
- [ ] Club deletion removes associated chat
- [ ] User preferences honored for group adds
