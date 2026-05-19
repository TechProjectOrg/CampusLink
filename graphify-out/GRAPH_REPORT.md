# Graph Report - final-year-project  (2026-05-19)

## Corpus Check
- 186 files · ~233,225 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1463 nodes · 2367 edges · 46 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 357 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 140|Community 140]]
- [[_COMMUNITY_Community 141|Community 141]]

## God Nodes (most connected - your core abstractions)
1. `safeFetch()` - 29 edges
2. `cacheSetJson()` - 23 edges
3. `cacheDelete()` - 18 edges
4. `authHeaders()` - 18 edges
5. `authHeaders()` - 18 edges
6. `parseErrorMessage()` - 18 edges
7. `writeCacheEntry()` - 17 edges
8. `authHeaders()` - 15 edges
9. `safeFetch()` - 15 edges
10. `parseErrorMessage()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `cacheDelete()` --calls--> `invalidateConversationLists()`  [INFERRED]
  backend\server\src\lib\cache.ts → backend\server\src\lib\chatCache.ts
- `persistCreatedPost()` --calls--> `collectImageFiles()`  [INFERRED]
  frontend\src\App.tsx → frontend\src\lib\mediaUtils.ts
- `handleCreateClubPostFromModal()` --calls--> `apiCreateUserPost()`  [INFERRED]
  frontend\src\components\ClubActivityPage.tsx → frontend\src\lib\postsApi.ts
- `handleSaveEducation()` --calls--> `apiUpdateUserProfile()`  [INFERRED]
  frontend\src\components\ProfilePage.tsx → frontend\src\lib\authApi.ts
- `Legacy SQL Social Schema` --semantically_similar_to--> `Frontend Copy of Legacy SQL Social Schema`  [INFERRED] [semantically similar]
  database/DATABASE_README.md → frontend/database/DATABASE_README.md

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (81): invalidateAdminClubCaches(), incrementCounter(), appendStreamMessage(), areRedisStreamsEnabled(), cacheDelete(), cacheExpire(), cacheHashDelete(), cacheHashIncrementBy() (+73 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (59): apiCreateUserCertification(), apiDeleteUserCertification(), apiFetchUserCertifications(), apiUpdateUserCertification(), authHeaders(), parseErrorMessage(), apiCreateUserExperience(), apiDeleteUserExperience() (+51 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (51): apiNotificationToLocal(), areStringArraysEqual(), buildCreatePostPayloadFromDraft(), clearReconnectTimer(), createInitialDiscussionPageState(), findCommentInTree(), findCommentStateById(), findOpportunityIdByCommentId() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (44): buildClientRedirect(), buildMagicLinkRedirect(), buildOnboardingResponse(), buildPasswordResetRedirect(), createAlumniUser(), createAuthSession(), createDefaultUserSettings(), createStudentUser() (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (46): handlePasswordChange(), apiAuthenticateWithGoogle(), apiBlockUser(), apiChangePassword(), apiCheckUsernameAvailability(), apiCompleteGoogleOnboarding(), apiCompleteMagicLinkOnboarding(), apiCompletePasswordReset() (+38 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (49): addReportNote(), async(), buildAnnouncementsQueryString(), buildClubsQueryString(), buildLogsQueryString(), buildPostsQueryString(), buildQueryString(), buildReportsQueryString() (+41 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (56): getCounterValue(), cacheGetJson(), cacheHashGet(), cacheHashMultiGet(), cacheHashSet(), parseJson(), buildConversationListEntries(), cacheAndEmitMessage() (+48 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (45): handleMarkAllAsRead(), compareVersions(), createCacheEntry(), createPageEntry(), enforcePolicyLimit(), estimateByteSize(), incrementCacheRevalidations(), invalidateCache() (+37 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (44): buildAuthenticatedResponse(), applyModerationAction(), assertCanComment(), assertCanLogin(), assertCanManageCommunities(), assertCanMessage(), assertCanPost(), assertCanUpload() (+36 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (40): autoAcceptRequestOnReply(), getChatParticipantIds(), markChatAccepted(), checkCanAddUserToChat(), checkChatPermission(), getUserChatRole(), getUserClubRole(), isGroupChatOwner() (+32 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (32): canAccessUserContent(), canMessage(), getBlockState(), getBlockStates(), getProfileVisibility(), getProfileVisibilityFromState(), isBlockedEitherWay(), maskUserCardForViewer() (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (12): createAuthSession(), detectBrowser(), detectPlatform(), ensureAdminSettingsRecord(), getBooleanSetting(), getClientIp(), getDefaultAdminSettings(), getPositiveNumberSetting() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (29): getJwtSecret(), signAuthToken(), signPasswordChangeToken(), signPasswordResetToken(), signVerificationActionToken(), verifyAuthToken(), verifyPasswordChangeToken(), verifyPasswordResetToken() (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (30): handleApproveRequest(), handleCreateClubPostFromModal(), handleDeleteClub(), handleInviteMember(), handleJoinCurrentClub(), handleRejectRequest(), handleSaveSettings(), handleToggleAdminRole() (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (21): cacheSetAdd(), cacheSetCardinality(), cacheSetMembers(), applyDiversity(), dismissedKey(), dismissSuggestedUser(), getSuggestedUsersForApi(), getVectorMap() (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (22): handleSave(), apiAddComment(), apiAddReply(), apiCreateUserPost(), apiDeleteComment(), apiDeletePost(), apiFetchCommentContext(), apiFetchHashtagPosts() (+14 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (14): handleAlumniSignup(), handleLogin(), handleLoginGoogle(), handleSendVerificationLink(), handleSignupGoogle(), handleStudentSignup(), if(), moveToOnboarding() (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (12): handleEventSubmit(), handleOpportunitySubmit(), handlePostSubmit(), resetAllForms(), collectImageFiles(), resolvePostImageUrls(), withOpportunityImages(), userPostToOpportunity() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (18): canViewerAccessClubPost(), ensureUniqueClubSlug(), getClubPermissionSnapshot(), loadClubAccess(), normalizeClubCategoryName(), normalizeClubTagName(), parseActiveRestrictions(), resolveOrCreateClubCategory() (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (11): Alert(), dataUrlToFile(), handleSaveCrop(), formatDate(), handleSaveDescription(), getCroppedImage(), loadImage(), PostPage() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.32
Nodes (16): buildStorageEnv(), deleteManagedChatMediaByUrl(), deleteManagedClubMediaByUrl(), deleteManagedPhotoByUrl(), deleteManagedPostMediaByUrl(), extensionFromMime(), getS3Client(), getStorageEnv() (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (5): ensureCanViewProfileDetails(), mapUserPostRow(), normalizeHashtag(), normalizeHashtags(), parseMediaValue()

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (7): handleLogout(), handOffAdminSession(), clearStoredSession(), getAuthToken(), readStoredSession(), clearAdminSession(), writeAdminSession()

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (5): AppDataProvider(), createInitialState(), createStore(), upsertTimelinePost(), upsertUniquePostIds()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (10): handleMarkAsRead(), apiDeletePushSubscription(), apiFetchNotifications(), apiFetchPushPublicKey(), apiMarkAllNotificationsRead(), apiMarkNotificationRead(), apiSavePushSubscription(), authHeaders() (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (2): SidebarMenuButton(), useSidebar()

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (7): buildHealthReport(), buildRoutes(), collectRouterRoutes(), getRoutePaths(), joinPaths(), normalizePath(), probeDatabaseHealth()

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (2): mergeConversationPreviewOnMessage(), sortConversationsByTimestamp()

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (2): getAdminAccountByUserId(), requireAdmin()

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (2): handleMobileSearchChange(), handleSearchChange()

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (2): FloatingChat(), useBottomAnchoredChatScroll()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (6): apiCreateUserAchievement(), apiDeleteUserAchievement(), apiFetchUserAchievements(), apiUpdateUserAchievement(), authHeaders(), parseErrorMessage()

### Community 42 - "Community 42"
Cohesion: 0.48
Nodes (5): apiCreateModerationReport(), apiFetchModerationState(), authHeaders(), parseError(), submit()

### Community 43 - "Community 43"
Cohesion: 0.47
Nodes (4): Assert-Status(), Assert-True(), Get-ResponseContent(), Invoke-JsonRequest()

### Community 45 - "Community 45"
Cohesion: 0.53
Nodes (4): FormControl(), FormDescription(), FormMessage(), useFormField()

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (2): getRequiredLeaveSuccessor(), promptForGroupSuccessor()

### Community 48 - "Community 48"
Cohesion: 0.6
Nodes (3): handleClose(), handleCreateGroup(), handleStartChat()

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (2): CarouselNext(), useCarousel()

### Community 52 - "Community 52"
Cohesion: 0.5
Nodes (5): Chat Scroll Architecture Issues, Fixed Sidebar Header, Infinite Scroll Pagination, Newest Message at Bottom, Pagination Prevents Large Conversation Performance Issues

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (5): Canonical Schema Direction, Clean Normalized Schema Rationale, Full Visible Product Coverage, Normalized Target Schema, Teacher Role Removal

### Community 54 - "Community 54"
Cohesion: 0.83
Nodes (3): main(), makeUniqueUsername(), normalizeExistingUsername()

### Community 62 - "Community 62"
Cohesion: 0.5
Nodes (4): Legacy Database Bootstrap, Legacy SQL Social Schema, Frontend Copy of Legacy Database Bootstrap, Frontend Copy of Legacy SQL Social Schema

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (3): shadcn/ui MIT Attribution, Unsplash License Attribution, Figma Design Reference

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (2): Mock Data Architecture, Tab-Based SPA Navigation

### Community 140 - "Community 140"
Cohesion: 1.0
Nodes (1): Local Development Setup

### Community 141 - "Community 141"
Cohesion: 1.0
Nodes (1): Custom Guidelines Placeholder

## Knowledge Gaps
- **14 isolated node(s):** `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup`, `Canonical Schema Direction`, `Teacher Role Removal` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 25`** (10 nodes): `sidebar.tsx`, `cn()`, `handleKeyDown()`, `SidebarFooter()`, `SidebarHeader()`, `SidebarMenu()`, `SidebarMenuButton()`, `SidebarMenuItem()`, `SidebarSeparator()`, `useSidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (9 nodes): `formatSeenTime()`, `mapRealtimeChatMessage()`, `mergeChatMessageList()`, `mergeConversationPresenceUpdate()`, `mergeConversationPreviewOnMessage()`, `mergeConversationReadUpdate()`, `sortConversationsByTimestamp()`, `summarizeReply()`, `chatUi.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (7 nodes): `getAdminAccountByUserId()`, `markAdminLogin()`, `recordAdminAuditLog()`, `setAdminMustChangePassword()`, `admin.ts`, `requireAdmin.ts`, `requireAdmin()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (7 nodes): `Navbar.tsx`, `handleMobileSearchChange()`, `handleMobileSearchToggle()`, `handleSearchChange()`, `handleSearchFocus()`, `handleTabletSearchToggle()`, `handleTabNavigate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (7 nodes): `FloatingChat()`, `FloatingChat.tsx`, `useBottomAnchoredChatScroll.ts`, `createConversationScrollState()`, `getFirstVisibleMessageAnchor()`, `getMessageElement()`, `useBottomAnchoredChatScroll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (5 nodes): `getRequiredLeaveSuccessor()`, `openPost()`, `promptForGroupSuccessor()`, `TypingAnimatedText()`, `ChatPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (5 nodes): `Carousel()`, `CarouselNext()`, `cn()`, `useCarousel()`, `carousel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (2 nodes): `Mock Data Architecture`, `Tab-Based SPA Navigation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (1 nodes): `Local Development Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (1 nodes): `Custom Guidelines Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cacheDelete()` connect `Community 0` to `Community 9`, `Community 10`, `Community 6`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `handlePasswordChange()` connect `Community 4` to `Community 5`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `fetchCachedValue()` connect `Community 1` to `Community 13`, `Community 7`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `cacheSetJson()` (e.g. with `setCachedRecentMessages()` and `setConversationMeta()`) actually correct?**
  _`cacheSetJson()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `cacheDelete()` (e.g. with `invalidateConversationLists()` and `reconcileConversationMeta()`) actually correct?**
  _`cacheDelete()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Sidebar Header`, `Pagination Prevents Large Conversation Performance Issues`, `Local Development Setup` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._