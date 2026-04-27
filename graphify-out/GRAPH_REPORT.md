# Graph Report - final-year-project  (2026-04-27)

## Corpus Check
- 135 files · ~105,029 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 876 nodes · 1253 edges · 30 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `authHeaders()` - 17 edges
2. `parseErrorMessage()` - 17 edges
3. `cacheSetJson()` - 15 edges
4. `safeFetch()` - 15 edges
5. `runCommand()` - 12 edges
6. `hydratePosts()` - 12 edges
7. `authHeaders()` - 12 edges
8. `cacheDelete()` - 11 edges
9. `getStorageEnv()` - 11 edges
10. `cacheAndEmitMessage()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `cacheDelete()` --calls--> `invalidateConversationLists()`  [INFERRED]
  backend\server\src\lib\cache.ts → backend\server\src\lib\chatCache.ts
- `cacheDelete()` --calls--> `invalidateConversationLists()`  [INFERRED]
  backend\server\src\lib\cache.ts → backend\server\src\lib\userCache.ts
- `getUserSummariesByIds()` --calls--> `formatMessagesForResponse()`  [INFERRED]
  backend\server\src\lib\userCache.ts → backend\server\src\routes\chat.ts
- `loadPosts()` --calls--> `apiFetchProfilePosts()`  [INFERRED]
  frontend\src\components\ProfilePage.tsx → frontend\src\lib\postsApi.ts
- `App.tsx State Centralization` --semantically_similar_to--> `Tab-Based SPA Navigation`  [INFERRED] [semantically similar]
  gemini.md → WARP.md

## Hyperedges (group relationships)
- **Schema Alignment Bundle** — schema_alignment_canonical_schema_direction, schema_alignment_normalized_target_schema, schema_alignment_full_product_coverage, codebase_reference_backend_frontend_gap [EXTRACTED 1.00]
- **Realtime Delivery Stack** — api_realtime_ws_contract, architecture_notification_delivery_pipeline, architecture_cache_first_shared_store, project_runtime_surfaces [INFERRED 0.84]
- **Chat History Loading Pattern** — chatpage_infinite_scroll_pagination, chatpage_newest_message_bottom, api_cursor_pagination_contracts, architecture_cache_first_shared_store [INFERRED 0.81]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (40): areStringArraysEqual(), buildCreatePostPayloadFromDraft(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId(), getAccountType(), handleAcceptFollowRequest() (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (53): cacheGetJson(), cacheHashGet(), cacheHashMultiGet(), parseJson(), buildConversationListEntries(), cacheAndEmitMessage(), fetchConversationBaseRows(), fetchConversationUnreadRows() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (31): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), authHeaders(), parseErrorMessage(), closeModal(), handleAddAchievement(), handleAddCertification() (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (47): appendStreamMessage(), cacheDelete(), cacheExpire(), cacheHashDelete(), cacheHashIncrementBy(), cacheHashSet(), cacheHGetAll(), cacheIncrement() (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (16): Alert(), handleForgotPassword(), handleSignup(), formatDate(), formatMenuTimestamp(), handleDeleteMessage(), handleSendImage(), formatDate() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (25): PollingRedisSubscriber, areUsersMutuallyFollowing(), emitChatDelete(), emitChatMessage(), emitChatReaction(), emitChatRead(), emitChatRequestAccepted(), emitTypingIndicator() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (20): hydrateOrderedUsers(), mapMinimalUserFromSummary(), searchUsers(), chatConversationListKey(), fetchUserStatsByIdsFromDb(), fetchUserSummariesByIdsFromDb(), getCachedConversationList(), getUserStatsById() (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (21): handleCreateClubPost(), apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (22): apiChangePassword(), apiDeleteAccount(), apiFetchUserProfile(), apiFetchUserSessions(), apiFetchUserSettings(), apiLogin(), apiRevokeUserSession(), apiSignupAlumni() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): buildResponseWithToken(), createAuthSession(), describeDevice(), detectBrowser(), detectPlatform(), getClientIp(), getJwtSecret(), getSingleHeaderValue() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (16): canViewerAccessClubPost(), ensureUniqueClubSlug(), getClubPermissionSnapshot(), loadClubAccess(), normalizeClubCategoryName(), normalizeClubTagName(), resolveOrCreateClubCategory(), slugifyClubName() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (16): apiCreateClub(), apiFetchClub(), apiFetchClubCategories(), apiFetchClubMembers(), apiFetchClubPosts(), apiFetchClubs(), apiJoinClub(), apiLeaveClub() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (21): Cursor Pagination Contracts, HTTP API Contract, Realtime WebSocket Contract, Cache-First Shared Frontend Store, Client-Server Feature-Oriented Architecture, Notification Delivery Pipeline, Redis-Optional Caching Posture, S3 Media Upload Pipeline (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (13): buildGroupedLikeMessage(), createNotification(), fanoutNotification(), isNotificationEnabled(), loadNotificationRealtimeRow(), loadRecipientNotificationPreferences(), notifyCommentReply(), notifyPostComment() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (15): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedClubMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 16 - "Community 16"
Cohesion: 0.21
Nodes (4): handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (10): handleMarkAllAsRead(), handleMarkAsRead(), apiDeletePushSubscription(), apiFetchNotifications(), apiFetchPushPublicKey(), apiMarkAllNotificationsRead(), apiMarkNotificationRead(), apiSavePushSubscription() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (4): mapUserPostRow(), normalizeHashtag(), normalizeHashtags(), parseMediaValue()

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (7): shadcn/ui MIT Attribution, Unsplash License Attribution, App.tsx State Centralization, CampusLynk Platform Overview, Figma Design Reference, Mock Data Architecture, Tab-Based SPA Navigation

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (7): Backend-Frontend Coverage Gap, Visible Product Surface Drives Schema Planning, Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 30 - "Community 30"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 32 - "Community 32"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 36 - "Community 36"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (2): getAuthToken(), readStoredSession()

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (2): mutualFollowersCount(), uniqueIntersection()

## Ambiguous Edges - Review These
- `Frontend API Wrapper Boundary` → `Custom Guidelines Placeholder`  [AMBIGUOUS]
  frontend/src/guidelines/Guidelines.md · relation: conceptually_related_to

## Knowledge Gaps
- **17 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Graphify Workflow Guidance`, `Local Development Setup`, `Canonical Schema Direction` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (5 nodes): `clearStoredSession()`, `getAuthToken()`, `readStoredSession()`, `writeStoredSession()`, `authStorage.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (3 nodes): `NetworkPage.tsx`, `mutualFollowersCount()`, `uniqueIntersection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Frontend API Wrapper Boundary` and `Custom Guidelines Placeholder`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `apiCreateUserPost()` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `persistCreatedPost()` connect `Community 0` to `Community 7`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `apiFetchProfilePosts()` connect `Community 7` to `Community 2`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Graphify Workflow Guidance` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._