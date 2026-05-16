# Graph Report - final-year-project  (2026-05-16)

## Corpus Check
- 175 files · ~224,155 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1428 nodes · 2336 edges · 43 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 348 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 132|Community 132]]
- [[_COMMUNITY_Community 133|Community 133]]

## God Nodes (most connected - your core abstractions)
1. `safeFetch()` - 29 edges
2. `cacheSetJson()` - 23 edges
3. `Boolean()` - 23 edges
4. `cacheDelete()` - 18 edges
5. `authHeaders()` - 18 edges
6. `writeCacheEntry()` - 17 edges
7. `authHeaders()` - 17 edges
8. `parseErrorMessage()` - 17 edges
9. `authHeaders()` - 15 edges
10. `safeFetch()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `cacheDelete()` --calls--> `invalidateConversationLists()`  [INFERRED]
  backend\server\src\lib\cache.ts → backend\server\src\lib\chatCache.ts
- `getSubmitLabel()` --calls--> `Boolean()`  [INFERRED]
  frontend\src\components\CreateUnifiedPostModal.tsx → frontend\src\App.tsx
- `handleCreateClubPostFromModal()` --calls--> `apiCreateUserPost()`  [INFERRED]
  frontend\src\components\ClubActivityPage.tsx → frontend\src\lib\postsApi.ts
- `handleSaveEducation()` --calls--> `apiUpdateUserProfile()`  [INFERRED]
  frontend\src\components\ProfilePage.tsx → frontend\src\lib\authApi.ts
- `Legacy SQL Social Schema` --semantically_similar_to--> `Frontend Copy of Legacy SQL Social Schema`  [INFERRED] [semantically similar]
  database/DATABASE_README.md → frontend/database/DATABASE_README.md

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (72): incrementCounter(), appendStreamMessage(), areRedisStreamsEnabled(), cacheExpire(), cacheHashDelete(), cacheHashIncrementBy(), cacheHGetAll(), cacheIncrement() (+64 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (52): areStringArraysEqual(), Boolean(), buildCreatePostPayloadFromDraft(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId(), getAccountType() (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (56): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), apiUpdateUserCertification(), authHeaders(), parseErrorMessage(), apiCreateUserExperience(), apiDeleteUserExperience() (+48 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (52): buildClientRedirect(), buildMagicLinkRedirect(), buildOnboardingResponse(), buildPasswordResetRedirect(), buildUsernameSuggestion(), createAlumniUser(), createAuthSession(), createDefaultUserSettings() (+44 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (49): addReportNote(), async(), buildAnnouncementsQueryString(), buildClubsQueryString(), buildLogsQueryString(), buildPostsQueryString(), buildQueryString(), buildReportsQueryString() (+41 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (52): buildAuthenticatedResponse(), areUsersMutuallyFollowing(), emitChatDelete(), emitChatMessage(), emitChatReaction(), emitChatRead(), emitChatRequestAccepted(), emitTypingIndicator() (+44 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (46): handleMarkAllAsRead(), compareVersions(), createCacheEntry(), createPageEntry(), enforcePolicyLimit(), estimateByteSize(), incrementCacheRevalidations(), invalidateCache() (+38 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (54): getCounterValue(), cacheGetJson(), cacheHashGet(), cacheHashMultiGet(), cacheHashSet(), parseJson(), buildConversationListEntries(), cacheAndEmitMessage() (+46 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (23): Alert(), handleMessage(), apiCreateGroupConversation(), apiStartConversation(), clearLongPressTimer(), formatDate(), formatMenuTimestamp(), handleCreateGroup() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (36): canAccessUserContent(), canMessage(), getBlockState(), getBlockStates(), getProfileVisibility(), getProfileVisibilityFromState(), isBlockedEitherWay(), maskUserCardForViewer() (+28 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (43): handlePasswordChange(), apiAuthenticateWithGoogle(), apiBlockUser(), apiChangePassword(), apiCheckUsernameAvailability(), apiCompleteGoogleOnboarding(), apiCompleteMagicLinkOnboarding(), apiCompletePasswordReset() (+35 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (12): createAuthSession(), detectBrowser(), detectPlatform(), ensureAdminSettingsRecord(), getBooleanSetting(), getClientIp(), getDefaultAdminSettings(), getPositiveNumberSetting() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (34): autoAcceptRequestOnReply(), getChatParticipantIds(), markChatAccepted(), checkCanAddUserToChat(), checkChatPermission(), getUserChatRole(), getUserClubRole(), isGroupChatOwner() (+26 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (30): handleApproveRequest(), handleCreateClubPostFromModal(), handleDeleteClub(), handleInviteMember(), handleJoinCurrentClub(), handleRejectRequest(), handleSaveSettings(), handleToggleAdminRole() (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (30): invalidateAdminClubCaches(), cacheDelete(), acquireCacheLock(), buildEnvelope(), buildPermissionSnapshot(), cacheLockKey(), clubFeedKey(), clubMembershipKey() (+22 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (20): apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts(), apiFetchPostById() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (13): handleAlumniSignup(), handleLogin(), handleLoginGoogle(), handleSendVerificationLink(), handleSignupGoogle(), handleStudentSignup(), if(), moveToOnboarding() (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (18): canViewerAccessClubPost(), ensureUniqueClubSlug(), getClubPermissionSnapshot(), loadClubAccess(), normalizeClubCategoryName(), normalizeClubTagName(), parseActiveRestrictions(), resolveOrCreateClubCategory() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.2
Nodes (13): buildGroupedLikeMessage(), createNotification(), fanoutNotification(), isNotificationEnabled(), loadNotificationRealtimeRow(), loadRecipientNotificationPreferences(), notifyCommentReply(), notifyPostComment() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.32
Nodes (16): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedClubMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv() (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (7): handleLogout(), handOffAdminSession(), clearStoredSession(), getAuthToken(), readStoredSession(), clearAdminSession(), writeAdminSession()

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (5): getSubmitLabel(), handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms()

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (10): handleMarkAsRead(), apiDeletePushSubscription(), apiFetchNotifications(), apiFetchPushPublicKey(), apiMarkAllNotificationsRead(), apiMarkNotificationRead(), apiSavePushSubscription(), authHeaders() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 25 - "Community 25"
Cohesion: 0.36
Nodes (7): buildHealthReport(), buildRoutes(), collectRouterRoutes(), getRoutePaths(), joinPaths(), normalizePath(), probeDatabaseHealth()

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (2): getAdminAccountByUserId(), requireAdmin()

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (2): handleMobileSearchChange(), handleSearchChange()

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (6): apiCreateUserAchievement(), apiDeleteUserAchievement(), apiFetchUserAchievements(), apiUpdateUserAchievement(), authHeaders(), parseErrorMessage()

### Community 40 - "Community 40"
Cohesion: 0.48
Nodes (5): apiCreateModerationReport(), apiFetchModerationState(), authHeaders(), parseError(), submit()

### Community 41 - "Community 41"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 42 - "Community 42"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 44 - "Community 44"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 46 - "Community 46"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (5): Chat Scroll Architecture Issues, Fixed Sidebar Header, Infinite Scroll Pagination, Newest Message at Bottom, Pagination Prevents Large Conversation Performance Issues

### Community 50 - "Community 50"
Cohesion: 0.4
Nodes (5): Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 58 - "Community 58"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (2): mutualFollowersCount(), uniqueIntersection()

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): shadcn/ui MIT Attribution, Unsplash License Attribution, Figma Design Reference

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (2): Mock Data Architecture, Tab-Based SPA Navigation

### Community 132 - "Community 132"
Cohesion: 1.0
Nodes (1): Local Development Setup

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (1): Custom Guidelines Placeholder

## Knowledge Gaps
- **14 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup`, `Canonical Schema Direction`, `Teacher Role Removal` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (7 nodes): `getAdminAccountByUserId()`, `markAdminLogin()`, `recordAdminAuditLog()`, `setAdminMustChangePassword()`, `admin.ts`, `requireAdmin.ts`, `requireAdmin()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (7 nodes): `Navbar.tsx`, `handleMobileSearchChange()`, `handleMobileSearchToggle()`, `handleSearchChange()`, `handleSearchFocus()`, `handleTabletSearchToggle()`, `handleTabNavigate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (3 nodes): `NetworkPage.tsx`, `mutualFollowersCount()`, `uniqueIntersection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (2 nodes): `Mock Data Architecture`, `Tab-Based SPA Navigation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (1 nodes): `Local Development Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (1 nodes): `Custom Guidelines Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Boolean()` connect `Community 1` to `Community 0`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 11`, `Community 13`, `Community 15`, `Community 17`, `Community 22`?**
  _High betweenness centrality (0.429) - this node is a cross-community bridge._
- **Why does `getViewerState()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `cacheSetJson()` connect `Community 0` to `Community 3`, `Community 5`, `Community 7`, `Community 9`, `Community 14`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `Boolean()` (e.g. with `canViewerAccessClubPost()` and `getViewerState()`) actually correct?**
  _`Boolean()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `cacheDelete()` (e.g. with `invalidateConversationLists()` and `reconcileConversationMeta()`) actually correct?**
  _`cacheDelete()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._