# Graph Report - final-year-project  (2026-05-09)

## Corpus Check
- 158 files · ~137,796 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1071 nodes · 1654 edges · 35 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 238 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 126|Community 126]]
- [[_COMMUNITY_Community 127|Community 127]]

## God Nodes (most connected - your core abstractions)
1. `cacheSetJson()` - 21 edges
2. `cacheDelete()` - 18 edges
3. `writeCacheEntry()` - 17 edges
4. `authHeaders()` - 17 edges
5. `parseErrorMessage()` - 17 edges
6. `safeFetch()` - 15 edges
7. `authHeaders()` - 15 edges
8. `safeFetch()` - 15 edges
9. `parseErrorMessage()` - 15 edges
10. `runCommand()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `getUserSummariesByIds()` --calls--> `formatMessagesForResponse()`  [INFERRED]
  backend\server\src\lib\userCache.ts → backend\server\src\routes\chat.ts
- `Legacy SQL Social Schema` --semantically_similar_to--> `Frontend Copy of Legacy SQL Social Schema`  [INFERRED] [semantically similar]
  database/DATABASE_README.md → frontend/database/DATABASE_README.md
- `Legacy Database Bootstrap` --semantically_similar_to--> `Frontend Copy of Legacy Database Bootstrap`  [INFERRED] [semantically similar]
  database/QUICKSTART.md → frontend/database/QUICKSTART.md
- `verifyAuthToken()` --calls--> `authenticateSocket()`  [INFERRED]
  backend\server\src\lib\auth.ts → backend\server\src\lib\realtime.ts
- `cacheGetJson()` --calls--> `getCachedRecentMessages()`  [INFERRED]
  backend\server\src\lib\cache.ts → backend\server\src\lib\chatCache.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (68): appendStreamMessage(), cacheExpire(), cacheGetJson(), cacheHashDelete(), cacheHashIncrementBy(), cacheHashSet(), cacheIncrement(), cacheSetAdd() (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (58): handleMarkAllAsRead(), handleMarkAsRead(), compareVersions(), createCacheEntry(), createPageEntry(), enforcePolicyLimit(), estimateByteSize(), incrementCacheRevalidations() (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (42): areStringArraysEqual(), buildCreatePostPayloadFromDraft(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId(), getAccountType(), handleAcceptFollowRequest() (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (24): Alert(), handleMessage(), handleForgotPassword(), handleSignup(), apiCreateGroupConversation(), apiStartConversation(), ChatPage(), formatDate() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (50): cacheHashGet(), cacheHashMultiGet(), buildConversationListEntries(), cacheAndEmitMessage(), fetchConversationBaseRows(), fetchConversationUnreadRows(), fetchMessageRows(), fetchMessagesForRequest() (+42 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (30): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), authHeaders(), parseErrorMessage(), closeModal(), handleAddAchievement(), handleAddCertification() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (25): PollingRedisSubscriber, areUsersMutuallyFollowing(), emitChatDelete(), emitChatMessage(), emitChatReaction(), emitChatRead(), emitChatRequestAccepted(), emitTypingIndicator() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (32): getChatParticipantIds(), checkCanAddUserToChat(), checkChatPermission(), getUserChatRole(), getUserClubRole(), isGroupChatOwner(), validateRoleChange(), createSystemEvent() (+24 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (29): handleApproveRequest(), handleDeleteClub(), handleInviteMember(), handleJoinCurrentClub(), handleRejectRequest(), handleSaveSettings(), handleToggleAdminRole(), loadClubData() (+21 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (31): cacheDelete(), cacheSetJsonIfNotExists(), invalidateConversationLists(), acquireCacheLock(), buildEnvelope(), buildPermissionSnapshot(), cacheLockKey(), clubFeedKey() (+23 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (21): cacheHGetAll(), hydrateOrderedUsers(), mapMinimalUserFromSummary(), searchUsers(), chatConversationListKey(), fetchUserStatsByIdsFromDb(), fetchUserSummariesByIdsFromDb(), getCachedConversationList() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (22): apiChangePassword(), apiDeleteAccount(), apiFetchUserProfile(), apiFetchUserSessions(), apiFetchUserSettings(), apiLogin(), apiRevokeUserSession(), apiSignupAlumni() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (21): handleCreateClubPostFromModal(), apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (17): canViewerAccessClubPost(), ensureUniqueClubSlug(), getClubPermissionSnapshot(), loadClubAccess(), normalizeClubCategoryName(), normalizeClubTagName(), parseActiveRestrictions(), resolveOrCreateClubCategory() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (13): buildResponseWithToken(), createAuthSession(), describeDevice(), detectBrowser(), detectPlatform(), getClientIp(), getJwtSecret(), getSingleHeaderValue() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (13): buildGroupedLikeMessage(), createNotification(), fanoutNotification(), isNotificationEnabled(), loadNotificationRealtimeRow(), loadRecipientNotificationPreferences(), notifyCommentReply(), notifyPostComment() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (15): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedClubMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (4): handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms()

### Community 19 - "Community 19"
Cohesion: 0.24
Nodes (4): mapUserPostRow(), normalizeHashtag(), normalizeHashtags(), parseMediaValue()

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 32 - "Community 32"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 33 - "Community 33"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 35 - "Community 35"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (2): getAuthToken(), readStoredSession()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (5): Chat Scroll Architecture Issues, Fixed Sidebar Header, Infinite Scroll Pagination, Newest Message at Bottom, Pagination Prevents Large Conversation Performance Issues

### Community 41 - "Community 41"
Cohesion: 0.4
Nodes (5): Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 48 - "Community 48"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (2): mutualFollowersCount(), uniqueIntersection()

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (3): shadcn/ui MIT Attribution, Unsplash License Attribution, Figma Design Reference

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (2): Mock Data Architecture, Tab-Based SPA Navigation

### Community 126 - "Community 126"
Cohesion: 1.0
Nodes (1): Local Development Setup

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (1): Custom Guidelines Placeholder

## Knowledge Gaps
- **14 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup`, `Canonical Schema Direction`, `Teacher Role Removal` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 20`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (5 nodes): `clearStoredSession()`, `getAuthToken()`, `readStoredSession()`, `writeStoredSession()`, `authStorage.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (3 nodes): `NetworkPage.tsx`, `mutualFollowersCount()`, `uniqueIntersection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (2 nodes): `Mock Data Architecture`, `Tab-Based SPA Navigation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 126`** (1 nodes): `Local Development Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (1 nodes): `Custom Guidelines Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleMessage()` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `loadPosts()` connect `Community 1` to `Community 12`, `Community 5`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `cacheDelete()` (e.g. with `invalidateConversationLists()` and `reconcileConversationMeta()`) actually correct?**
  _`cacheDelete()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `writeCacheEntry()` (e.g. with `writePersistentEntry()` and `fetchWithCache()`) actually correct?**
  _`writeCacheEntry()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._