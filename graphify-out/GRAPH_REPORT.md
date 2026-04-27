# Graph Report - D:\College\BTech\Final Year Project\final-year-project  (2026-04-27)

## Corpus Check
- 152 files · ~106,728 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 847 nodes · 1185 edges · 29 communities detected
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 149 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Notificationsapi Chatapi Chatpage|Notificationsapi Chatapi Chatpage]]
- [[_COMMUNITY_Chatcache Chat Cache|Chatcache Chat Cache]]
- [[_COMMUNITY_PollingRedisSubscriber|PollingRedisSubscriber]]
- [[_COMMUNITY_Profilepage Certificationsapi Projectsapi|Profilepage Certificationsapi Projectsapi]]
- [[_COMMUNITY_Chatpage Floatingchat Profile|Chatpage Floatingchat Profile]]
- [[_COMMUNITY_Realtime Chat Chatcache|Realtime Chat Chatcache]]
- [[_COMMUNITY_Usercache Search Network|Usercache Search Network]]
- [[_COMMUNITY_Authapi Settingspage Profilepage|Authapi Settingspage Profilepage]]
- [[_COMMUNITY_Postsapi|Postsapi]]
- [[_COMMUNITY_Auth Realtime|Auth Realtime]]
- [[_COMMUNITY_Cursor Pagination Contracts|Cursor Pagination Contracts]]
- [[_COMMUNITY_Notifications Push|Notifications Push]]
- [[_COMMUNITY_Networkapi|Networkapi]]
- [[_COMMUNITY_Objectstorage|Objectstorage]]
- [[_COMMUNITY_Appdatacontext|Appdatacontext]]
- [[_COMMUNITY_Createunifiedpostmodal|Createunifiedpostmodal]]
- [[_COMMUNITY_Posts|Posts]]
- [[_COMMUNITY_Sidebar|Sidebar]]
- [[_COMMUNITY_Users|Users]]
- [[_COMMUNITY_Chatui|Chatui]]
- [[_COMMUNITY_shadcnui MIT Attribution|shadcn/ui MIT Attribution]]
- [[_COMMUNITY_Backend-Frontend Coverage Gap|Backend-Frontend Coverage Gap]]
- [[_COMMUNITY_Network E2e Test|Network E2e Test]]
- [[_COMMUNITY_Form|Form]]
- [[_COMMUNITY_Newchatmodal|Newchatmodal]]
- [[_COMMUNITY_Carousel|Carousel]]
- [[_COMMUNITY_Authstorage|Authstorage]]
- [[_COMMUNITY_Legacy Database Bootstrap|Legacy Database Bootstrap]]
- [[_COMMUNITY_Networkpage|Networkpage]]

## God Nodes (most connected - your core abstractions)
1. `authHeaders()` - 17 edges
2. `parseErrorMessage()` - 17 edges
3. `cacheSetJson()` - 15 edges
4. `safeFetch()` - 15 edges
5. `runCommand()` - 12 edges
6. `hydratePosts()` - 12 edges
7. `authHeaders()` - 12 edges
8. `cacheDelete()` - 11 edges
9. `cacheAndEmitMessage()` - 11 edges
10. `reconcileConversationMeta()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `invalidateConversationLists()` --calls--> `cacheDelete()`  [INFERRED]
  D:\College\BTech\Final Year Project\final-year-project\backend\server\src\lib\chatCache.ts → D:\College\BTech\Final Year Project\final-year-project\backend\server\src\lib\cache.ts
- `invalidateConversationLists()` --calls--> `cacheDelete()`  [INFERRED]
  D:\College\BTech\Final Year Project\final-year-project\backend\server\src\lib\userCache.ts → D:\College\BTech\Final Year Project\final-year-project\backend\server\src\lib\cache.ts
- `formatMessagesForResponse()` --calls--> `getUserSummariesByIds()`  [INFERRED]
  D:\College\BTech\Final Year Project\final-year-project\backend\server\src\routes\chat.ts → D:\College\BTech\Final Year Project\final-year-project\backend\server\src\lib\userCache.ts
- `loadPosts()` --calls--> `apiFetchProfilePosts()`  [INFERRED]
  D:\College\BTech\Final Year Project\final-year-project\frontend\src\components\ProfilePage.tsx → D:\College\BTech\Final Year Project\final-year-project\frontend\src\lib\postsApi.ts
- `App.tsx State Centralization` --semantically_similar_to--> `Tab-Based SPA Navigation`  [INFERRED] [semantically similar]
  gemini.md → WARP.md

## Hyperedges (group relationships)
- **Schema Alignment Bundle** — schema_alignment_canonical_schema_direction, schema_alignment_normalized_target_schema, schema_alignment_full_product_coverage, codebase_reference_backend_frontend_gap [EXTRACTED 1.00]
- **Realtime Delivery Stack** — api_realtime_ws_contract, architecture_notification_delivery_pipeline, architecture_cache_first_shared_store, project_runtime_surfaces [INFERRED 0.84]
- **Chat History Loading Pattern** — chatpage_infinite_scroll_pagination, chatpage_newest_message_bottom, api_cursor_pagination_contracts, architecture_cache_first_shared_store [INFERRED 0.81]

## Communities

### Community 0 - "Notificationsapi Chatapi Chatpage"
Cohesion: 0.04
Nodes (34): areStringArraysEqual(), buildCreatePostPayloadFromDraft(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId(), getAccountType(), handleCreateEvent() (+26 more)

### Community 1 - "Chatcache Chat Cache"
Cohesion: 0.07
Nodes (53): cacheGetJson(), cacheHashGet(), cacheHashMultiGet(), parseJson(), buildConversationListEntries(), cacheAndEmitMessage(), fetchConversationBaseRows(), fetchConversationUnreadRows() (+45 more)

### Community 2 - "PollingRedisSubscriber"
Cohesion: 0.08
Nodes (49): appendStreamMessage(), cacheDelete(), cacheExpire(), cacheHashDelete(), cacheHashIncrementBy(), cacheHashSet(), cacheHGetAll(), cacheIncrement() (+41 more)

### Community 3 - "Profilepage Certificationsapi Projectsapi"
Cohesion: 0.06
Nodes (31): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), authHeaders(), parseErrorMessage(), closeModal(), handleAddAchievement(), handleAddCertification() (+23 more)

### Community 4 - "Chatpage Floatingchat Profile"
Cohesion: 0.06
Nodes (16): Alert(), handleForgotPassword(), handleSignup(), formatDate(), formatMenuTimestamp(), handleDeleteMessage(), handleSendImage(), formatDate() (+8 more)

### Community 5 - "Realtime Chat Chatcache"
Cohesion: 0.11
Nodes (22): areUsersMutuallyFollowing(), emitChatDelete(), emitChatMessage(), emitChatReaction(), emitChatRead(), emitChatRequestAccepted(), emitTypingIndicator(), getChatParticipantIds() (+14 more)

### Community 6 - "Usercache Search Network"
Cohesion: 0.11
Nodes (21): hydrateOrderedUsers(), mapMinimalUserFromSummary(), searchUsers(), chatConversationListKey(), fetchUserStatsByIdsFromDb(), fetchUserSummariesByIdsFromDb(), getCachedConversationList(), getUserStatsById() (+13 more)

### Community 7 - "Authapi Settingspage Profilepage"
Cohesion: 0.16
Nodes (22): apiChangePassword(), apiDeleteAccount(), apiFetchUserProfile(), apiFetchUserSessions(), apiFetchUserSettings(), apiLogin(), apiRevokeUserSession(), apiSignupAlumni() (+14 more)

### Community 8 - "Postsapi"
Cohesion: 0.2
Nodes (20): apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts(), apiFetchPostById() (+12 more)

### Community 9 - "Auth Realtime"
Cohesion: 0.13
Nodes (14): buildResponseWithToken(), createAuthSession(), describeDevice(), detectBrowser(), detectPlatform(), getClientIp(), getJwtSecret(), getSingleHeaderValue() (+6 more)

### Community 10 - "Cursor Pagination Contracts"
Cohesion: 0.11
Nodes (21): Cursor Pagination Contracts, HTTP API Contract, Realtime WebSocket Contract, Cache-First Shared Frontend Store, Client-Server Feature-Oriented Architecture, Notification Delivery Pipeline, Redis-Optional Caching Posture, S3 Media Upload Pipeline (+13 more)

### Community 11 - "Notifications Push"
Cohesion: 0.21
Nodes (13): buildGroupedLikeMessage(), createNotification(), fanoutNotification(), isNotificationEnabled(), loadNotificationRealtimeRow(), loadRecipientNotificationPreferences(), notifyCommentReply(), notifyPostComment() (+5 more)

### Community 12 - "Networkapi"
Cohesion: 0.25
Nodes (16): handleAcceptFollowRequest(), handleCancelRequest(), handleRejectFollowRequest(), handleRemoveFollower(), handleUnfollow(), apiAcceptFollowRequest(), apiCancelFollowRequest(), apiFollow() (+8 more)

### Community 13 - "Objectstorage"
Cohesion: 0.36
Nodes (13): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv(), normalizeBaseUrl() (+5 more)

### Community 14 - "Appdatacontext"
Cohesion: 0.18
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 15 - "Createunifiedpostmodal"
Cohesion: 0.21
Nodes (4): handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms()

### Community 16 - "Posts"
Cohesion: 0.25
Nodes (6): fetchCommentsForPost(), mapCommentRows(), mapFeedRows(), normalizeHashtag(), normalizeHashtags(), parseMedia()

### Community 18 - "Sidebar"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 19 - "Users"
Cohesion: 0.28
Nodes (4): mapUserPostRow(), normalizeHashtag(), normalizeHashtags(), parseMediaValue()

### Community 22 - "Chatui"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 23 - "shadcn/ui MIT Attribution"
Cohesion: 0.25
Nodes (8): shadcn/ui MIT Attribution, Unsplash License Attribution, Frontend Root Mount, App.tsx State Centralization, CampusLynk Platform Overview, Figma Design Reference, Mock Data Architecture, Tab-Based SPA Navigation

### Community 28 - "Backend-Frontend Coverage Gap"
Cohesion: 0.29
Nodes (7): Backend-Frontend Coverage Gap, Visible Product Surface Drives Schema Planning, Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 29 - "Network E2e Test"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 31 - "Form"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 34 - "Newchatmodal"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 36 - "Carousel"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 39 - "Authstorage"
Cohesion: 0.5
Nodes (2): getAuthToken(), readStoredSession()

### Community 47 - "Legacy Database Bootstrap"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 50 - "Networkpage"
Cohesion: 1.0
Nodes (2): mutualFollowersCount(), uniqueIntersection()

## Ambiguous Edges - Review These
- `Frontend API Wrapper Boundary` → `Custom Guidelines Placeholder`  [AMBIGUOUS]
  frontend/src/guidelines/Guidelines.md · relation: conceptually_related_to

## Knowledge Gaps
- **18 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Graphify Workflow Guidance`, `Local Development Setup`, `Canonical Schema Direction` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Sidebar`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Chatui`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Carousel`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Authstorage`** (5 nodes): `clearStoredSession()`, `getAuthToken()`, `readStoredSession()`, `writeStoredSession()`, `authStorage.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Networkpage`** (3 nodes): `NetworkPage.tsx`, `mutualFollowersCount()`, `uniqueIntersection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Frontend API Wrapper Boundary` and `Custom Guidelines Placeholder`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `persistCreatedPost()` connect `Notificationsapi Chatapi Chatpage` to `Postsapi`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `apiCreateUserPost()` connect `Postsapi` to `Notificationsapi Chatapi Chatpage`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `apiFetchProfilePosts()` connect `Postsapi` to `Profilepage Certificationsapi Projectsapi`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Graphify Workflow Guidance` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Notificationsapi Chatapi Chatpage` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._