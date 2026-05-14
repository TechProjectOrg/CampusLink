# Graph Report - final-year-project  (2026-05-14)

## Corpus Check
- 167 files · ~187,415 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1253 nodes · 2004 edges · 39 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 294 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 128|Community 128]]
- [[_COMMUNITY_Community 129|Community 129]]

## God Nodes (most connected - your core abstractions)
1. `cacheSetJson()` - 21 edges
2. `cacheDelete()` - 18 edges
3. `safeFetch()` - 18 edges
4. `writeCacheEntry()` - 17 edges
5. `authHeaders()` - 17 edges
6. `parseErrorMessage()` - 17 edges
7. `authHeaders()` - 15 edges
8. `safeFetch()` - 15 edges
9. `parseErrorMessage()` - 15 edges
10. `authHeaders()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `getUserSummariesByIds()` --calls--> `formatMessagesForResponse()`  [INFERRED]
  backend\server\src\lib\userCache.ts → backend\server\src\routes\chat.ts
- `handleCreateClubPostFromModal()` --calls--> `apiCreateUserPost()`  [INFERRED]
  frontend\src\components\ClubActivityPage.tsx → frontend\src\lib\postsApi.ts
- `handleSaveEducation()` --calls--> `apiUpdateUserProfile()`  [INFERRED]
  frontend\src\components\ProfilePage.tsx → frontend\src\lib\authApi.ts
- `Legacy SQL Social Schema` --semantically_similar_to--> `Frontend Copy of Legacy SQL Social Schema`  [INFERRED] [semantically similar]
  database/DATABASE_README.md → frontend/database/DATABASE_README.md
- `Legacy Database Bootstrap` --semantically_similar_to--> `Frontend Copy of Legacy Database Bootstrap`  [INFERRED] [semantically similar]
  database/QUICKSTART.md → frontend/database/QUICKSTART.md

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (71): appendStreamMessage(), areRedisStreamsEnabled(), cacheDelete(), cacheExpire(), cacheHashDelete(), cacheHashIncrementBy(), cacheHashSet(), cacheIncrement() (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (56): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), apiUpdateUserCertification(), authHeaders(), parseErrorMessage(), apiCreateUserExperience(), apiDeleteUserExperience() (+48 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (32): Alert(), handleMessage(), handleAlumniSignup(), handleForgotPassword(), handleStudentGoogle(), handleStudentSignup(), parseGoogleCredentialEmail(), apiCreateGroupConversation() (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (42): areStringArraysEqual(), buildCreatePostPayloadFromDraft(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId(), getAccountType(), handleAcceptFollowRequest() (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (56): handleMarkAllAsRead(), handleMarkAsRead(), compareVersions(), createCacheEntry(), createPageEntry(), enforcePolicyLimit(), estimateByteSize(), incrementCacheRevalidations() (+48 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (48): addReportNote(), async(), buildAnnouncementsQueryString(), buildClubsQueryString(), buildLogsQueryString(), buildPostsQueryString(), buildQueryString(), buildReportsQueryString() (+40 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (55): cacheGetJson(), cacheHashGet(), cacheHashMultiGet(), parseJson(), autoAcceptRequestOnReply(), buildConversationListEntries(), cacheAndEmitMessage(), fetchConversationBaseRows() (+47 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (12): createAuthSession(), detectBrowser(), detectPlatform(), ensureAdminSettingsRecord(), getBooleanSetting(), getClientIp(), getDefaultAdminSettings(), getPositiveNumberSetting() (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (32): getChatParticipantIds(), checkCanAddUserToChat(), checkChatPermission(), getUserChatRole(), getUserClubRole(), isGroupChatOwner(), validateRoleChange(), createSystemEvent() (+24 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (30): handleApproveRequest(), handleCreateClubPostFromModal(), handleDeleteClub(), handleInviteMember(), handleJoinCurrentClub(), handleRejectRequest(), handleSaveSettings(), handleToggleAdminRole() (+22 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (30): invalidateAdminClubCaches(), cacheSetJsonIfNotExists(), acquireCacheLock(), buildEnvelope(), buildPermissionSnapshot(), cacheLockKey(), clubFeedKey(), clubMembershipKey() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (27): handlePasswordChange(), apiChangePassword(), apiDeleteAccount(), apiFetchUserProfile(), apiFetchUserSessions(), apiFetchUserSettings(), apiLogin(), apiLoginStudentWithGoogle() (+19 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (21): cacheHGetAll(), hydrateOrderedUsers(), mapMinimalUserFromSummary(), searchUsers(), chatConversationListKey(), fetchUserStatsByIdsFromDb(), fetchUserSummariesByIdsFromDb(), getCachedConversationList() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (22): areUsersMutuallyFollowing(), emitChatDelete(), emitChatMessage(), emitChatReaction(), emitChatRead(), emitChatRequestAccepted(), emitTypingIndicator(), getOrCreateDirectChat() (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (16): buildResponseWithToken(), createAuthSession(), describeDevice(), detectBrowser(), detectPlatform(), getClientIp(), getGoogleClientId(), getJwtSecret() (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (20): apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts(), apiFetchPostById() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (17): canViewerAccessClubPost(), ensureUniqueClubSlug(), getClubPermissionSnapshot(), loadClubAccess(), normalizeClubCategoryName(), normalizeClubTagName(), parseActiveRestrictions(), resolveOrCreateClubCategory() (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (13): buildGroupedLikeMessage(), createNotification(), fanoutNotification(), isNotificationEnabled(), loadNotificationRealtimeRow(), loadRecipientNotificationPreferences(), notifyCommentReply(), notifyPostComment() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.32
Nodes (16): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedClubMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (7): handleLogout(), handOffAdminSession(), clearStoredSession(), getAuthToken(), readStoredSession(), clearAdminSession(), writeAdminSession()

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (4): handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms()

### Community 22 - "Community 22"
Cohesion: 0.24
Nodes (4): mapUserPostRow(), normalizeHashtag(), normalizeHashtags(), parseMediaValue()

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (2): getAdminAccountByUserId(), requireAdmin()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (6): apiCreateUserAchievement(), apiDeleteUserAchievement(), apiFetchUserAchievements(), apiUpdateUserAchievement(), authHeaders(), parseErrorMessage()

### Community 37 - "Community 37"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 38 - "Community 38"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 40 - "Community 40"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (5): Chat Scroll Architecture Issues, Fixed Sidebar Header, Infinite Scroll Pagination, Newest Message at Bottom, Pagination Prevents Large Conversation Performance Issues

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (5): Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 54 - "Community 54"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (2): mutualFollowersCount(), uniqueIntersection()

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (3): shadcn/ui MIT Attribution, Unsplash License Attribution, Figma Design Reference

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (2): Mock Data Architecture, Tab-Based SPA Navigation

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (1): Local Development Setup

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (1): Custom Guidelines Placeholder

## Knowledge Gaps
- **14 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup`, `Canonical Schema Direction`, `Teacher Role Removal` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 23`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (7 nodes): `getAdminAccountByUserId()`, `markAdminLogin()`, `recordAdminAuditLog()`, `setAdminMustChangePassword()`, `admin.ts`, `requireAdmin.ts`, `requireAdmin()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (3 nodes): `NetworkPage.tsx`, `mutualFollowersCount()`, `uniqueIntersection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `Mock Data Architecture`, `Tab-Based SPA Navigation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (1 nodes): `Local Development Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (1 nodes): `Custom Guidelines Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleAddProject()` connect `Community 1` to `Community 2`, `Community 15`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `handlePasswordChange()` connect `Community 11` to `Community 5`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `apiCreateUserPost()` connect `Community 15` to `Community 9`, `Community 3`, `Community 1`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `cacheDelete()` (e.g. with `invalidateConversationLists()` and `reconcileConversationMeta()`) actually correct?**
  _`cacheDelete()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `writeCacheEntry()` (e.g. with `writePersistentEntry()` and `fetchWithCache()`) actually correct?**
  _`writeCacheEntry()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._