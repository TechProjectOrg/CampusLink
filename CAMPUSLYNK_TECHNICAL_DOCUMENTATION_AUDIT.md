# CampusLynk Final Year Project Technical Documentation and Audit

Prepared from repository inspection on 2026-05-16.

Source scope inspected: `frontend/`, `backend/`, `database/`, `backend/prisma/schema.prisma`, migration SQL files, routing files, WebSocket/cache/storage/auth utilities, frontend API clients, major UI components, and deployment configuration. The existing `graphify-out/GRAPH_REPORT.md` was used first, as required by the project instructions, to identify the main architectural communities: auth/session flows, feed/cache APIs, chat/realtime, admin/moderation, storage, notifications, clubs, and frontend state.

Important accuracy note: this report documents what exists in the codebase. It does not verify production DNS, live cloud dashboards, deployed environment variables, or hosted database state, because those are not present in the repository.

---

## 1. Project Overview

### Purpose
CampusLynk is a campus social networking and alumni engagement platform. It connects students and alumni through verified accounts, posts, opportunities, clubs, private/group chat, notifications, profiles, and an administrative moderation system.

### User Flow
1. A visitor opens the React SPA.
2. Unauthenticated users see `frontend/src/components/AuthPage.tsx`.
3. Students sign up using an official college email domain, defaulting to `gbpuat.ac.in` unless `AUTH_ALLOWED_EMAIL_DOMAIN` changes it.
4. Alumni sign up with profile details and proof files, then wait for admin verification.
5. Authenticated users access feed, search, network, chat, clubs, notifications, profile, and settings from `frontend/src/App.tsx`.
6. Admin users are handed off to `/admin` when their profile has admin access.

### Technical Implementation
The platform is a React + Vite frontend backed by an Express API server and PostgreSQL database managed through Prisma schema/migrations. Realtime updates use `ws` WebSockets at `/ws`, with optional Upstash Redis stream fanout for multi-instance delivery. Media uploads use S3-compatible object storage. Email flows use Resend. Web push uses VAPID through `web-push`.

### Technologies Used
React, Vite, TypeScript, Tailwind-style utility classes, Radix UI components, Sonner toasts, TanStack Query in admin, Express 5, Prisma 7, PostgreSQL, JWT, bcryptjs, multer, S3 SDK, Resend, ws, web-push, Upstash Redis REST/streams.

### Backend Logic
Backend modules are mounted in `backend/server/src/app.ts`: `/auth`, `/users`, `/search`, `/network`, `/notifications`, `/chat`, `/clubs`, `/group-chat`, `/admin`, and feed/post routes under `/`.

### Frontend Logic
The frontend is a tab-routed SPA centered in `frontend/src/App.tsx`, with page components for feed, search, network, chat, clubs, profiles, post detail, notifications, and settings. State is split between `AuthContext`, `AppDataContext`, frontend cache utilities, and local component state.

### Database Involvement
The database includes users, student/alumni profiles, settings, sessions, skills/certifications/projects/experiences/societies/achievements, follows, follow requests, clubs, posts, comments, likes/saves, chats, messages, notifications, push subscriptions, admin accounts, audit logs, reports, verification requests, and announcements.

### Security Considerations
The project uses JWT auth with database-backed session revocation, bcrypt password hashes, magic links, Google identity token verification, role checks for admin endpoints, CORS allowlists, and partial rate limiting. Main risks are localStorage token storage, missing CSRF protection, incomplete global rate limiting, no centralized schema validation library, and some schema/code drift.

### Performance Considerations
The project implements offset/cursor pagination, frontend memory/persistent cache, backend Redis cache helpers, chat recent-message caching, feed cache invalidation, and realtime event fanout. Risk areas include N+1-style post comment hydration, raw SQL complexity, offset pagination at scale, and very large frontend root component/state logic.

### Current Limitations/Issues
- Production infrastructure cannot be fully verified from repo files.
- `backend/server/src/lib/chatPermissions.ts` references `user_settings.group_add_preference`; the Prisma schema does not model it, though an older migration adds it.
- `admin_settings` is used by `admin.ts` and migration SQL but is not represented in `backend/prisma/schema.prisma`.
- Some admin features are implemented only in admin-specific APIs; there is no visible normal-user report submission endpoint in the public API routes inspected.
- Auth tokens are stored in localStorage.
- Backend uses mostly raw SQL, which is parameterized but harder to maintain than consistent Prisma client usage.

### Suggested Abstract
CampusLynk is a full-stack campus networking platform designed to connect students and alumni through verified digital identities, social feeds, clubs, opportunities, realtime chat, notifications, and administrative moderation. The system uses a React/Vite frontend, an Express/TypeScript backend, PostgreSQL with Prisma schema management, JWT-based authentication, WebSockets for realtime updates, S3-compatible storage for media, Resend for email delivery, and optional Redis caching/fanout. Students are onboarded through institutional email verification, while alumni follow a proof-based verification workflow reviewed by administrators. The platform demonstrates practical engineering concepts including role-based access control, database relationship modeling, realtime communication, media upload pipelines, notification fanout, user privacy controls, and moderation dashboards.

### Suggested Introduction
Educational institutions require sustainable digital systems for connecting current students with alumni, opportunities, communities, and peer networks. CampusLynk addresses this need by combining campus-focused social networking with verification, clubs, professional profiles, and realtime communication. Unlike generic social media platforms, the system differentiates students and alumni, controls onboarding through institutional signals, and gives administrators tools to verify users and moderate content.

### Problem Statement
Students often lack a dedicated institutional platform for discovering alumni guidance, peer projects, campus clubs, opportunities, and verified professional connections. Existing solutions are either too generic, not college-specific, or lack administrative verification and moderation workflows. CampusLynk aims to provide a secure, campus-centered platform where students and alumni can connect, share opportunities, communicate in realtime, and participate in verified communities.

### Objectives
- Build a verified student and alumni onboarding system.
- Provide a social feed for posts, events, opportunities, and club activity.
- Implement network/follow systems with privacy-aware messaging.
- Support realtime direct/group chat with media, typing indicators, reactions, read states, and presence.
- Provide profile management for academic and professional details.
- Implement club creation, membership, roles, and club posts.
- Add notifications through in-app, WebSocket, and push systems.
- Build admin tools for verification, moderation, analytics, reports, announcements, logs, and settings.
- Design a maintainable full-stack architecture suitable for academic demonstration and future production hardening.

---

## 2. Complete Tech Stack Analysis

| Layer | Technology | Purpose | Where Used |
| ----- | ---------- | ------- | ---------- |
| Frontend runtime | React 18 | Component UI and SPA rendering | `frontend/src/**/*.tsx` |
| Build tool | Vite 6 | Dev server and production bundling | `frontend/vite.config.ts` |
| Language | TypeScript | Typed frontend/backend code | `frontend/src`, `backend/server/src` |
| UI primitives | Radix UI | Dialogs, menus, popovers, tabs, controls | `frontend/src/components/ui/*` |
| Icons | lucide-react | Admin/user UI icons | `frontend/src/admin/AdminRoot.tsx`, components |
| Styling | Tailwind utility classes / CSS | Layout and responsive UI | `frontend/src/index.css`, components |
| Toasts | Sonner | User feedback notifications | `App.tsx`, `AdminRoot.tsx` |
| Admin data cache | TanStack Query | Admin API fetching/cache | `frontend/src/admin/AdminRoot.tsx` |
| Client state | Custom external store + contexts | Auth, posts, chat, users, cache | `AuthContext.tsx`, `AppDataContext.tsx` |
| Backend framework | Express 5 | REST API server | `backend/server/src/app.ts` |
| Database | PostgreSQL | Relational persistence | Prisma schema and raw SQL |
| ORM/schema | Prisma 7 | Schema, generated client, migrations | `backend/prisma/schema.prisma` |
| SQL access | Prisma `$queryRaw` / client | Parameterized SQL and some model operations | routes/libs |
| Auth tokens | jsonwebtoken | JWT signing/verification | `backend/server/src/lib/auth.ts` |
| Password hashing | bcryptjs | Password storage | `hashPassword`, `verifyPassword` |
| Realtime | ws | WebSocket server | `backend/server/src/lib/realtime.ts` |
| Cache/fanout | Upstash Redis REST/streams | Optional cache and cross-instance events | `backend/server/src/lib/cache.ts` |
| File uploads | multer | Multipart file parsing | auth, users, chat, clubs/group-chat routes |
| Object storage | AWS S3 SDK | Profile, post, chat, club, proof uploads | `backend/server/src/lib/objectStorage.ts` |
| Email | Resend | Magic links, password reset, verification decisions | `backend/server/src/lib/authEmail.ts` |
| Push | web-push | Browser push notifications | `backend/server/src/lib/push.ts`, `frontend/public/sw.js` |
| Deployment SPA | Vercel-style rewrite | Route fallback to `index.html` | `frontend/vercel.json` |
| CORS | cors middleware | Origin allowlist | `backend/server/src/app.ts` |
| Validation | Hand-written validators | Passwords, usernames, IDs, payload fields | routes/middleware |
| Pagination | Offset and cursor | Feed/search/users/admin/chat/comments | route query handling |
| Search | SQL `ILIKE` | User/hashtag/club/admin search | `routes/search.ts`, `routes/admin.ts` |
| Caching | Frontend cache + backend Redis cache | Reduce duplicate network/database work | `frontend/src/cache`, `backend/server/src/lib/cache.ts` |

### Why These Choices Fit the Implementation
React/Vite fits the SPA tab model and fast development cycle. Express is used because the backend is route-heavy and REST-oriented. PostgreSQL is appropriate because the domain is relational: users, follows, memberships, posts, comments, and messages. Prisma provides schema/migration structure, while raw SQL gives the author fine control over complex joins and counts. WebSockets are justified by chat, typing, presence, notifications, and feed events. Redis is optional but useful for cache and multi-instance realtime fanout. S3-compatible storage is appropriate because uploads are binary and should not be stored in the database.

### Current Limitations/Issues
- No validation library such as Zod/Joi is used consistently.
- `@tanstack/react-query` is used for admin, but the main app uses a custom store and cache, increasing mental overhead.
- No backend OpenAPI/Swagger route contract is present.
- No reverse proxy config is present in the repository.
- CDN usage is only implied through public S3 URLs and possible Vercel hosting; no CDN config file is present.

---

## 3. Frontend Architecture

### Purpose
The frontend provides the complete user experience: authentication, feed, profile, network, chat, clubs, notifications, settings, post detail pages, hashtag pages, and admin UI.

### User Flow
Unauthenticated users see `AuthPage`. Authenticated users enter the main layout from `App.tsx`, navigate with `Navbar`, and use tab-like route state rather than React Router. Admin users are redirected to `/admin` and handled by `frontend/src/admin/AdminRoot.tsx`.

### Technical Implementation
- Entry: `frontend/src/main.tsx`.
- Root page: `frontend/src/App.tsx`.
- Auth context: `frontend/src/context/AuthContext.tsx`.
- Data store: `frontend/src/context/AppDataContext.tsx`.
- API clients: `frontend/src/lib/*Api.ts`.
- Cache: `frontend/src/cache/*`.
- Admin: `frontend/src/admin/AdminRoot.tsx`, `api.ts`, `session.ts`.

### Technologies Used
React hooks, Context API, `useSyncExternalStore`, Vite environment variables, Radix UI components, Tailwind-like utility classes, Sonner, lucide-react, Recharts, TanStack Query in admin.

### Backend Logic
Frontend API clients call backend endpoints through `resolveApiBaseUrl()`. If `VITE_API_URL` is absent and host is localhost, it defaults to `http://localhost:4000`; otherwise it uses same-origin/empty base.

### Frontend Logic
`App.tsx` owns tab navigation and many handlers for feed, comments, notifications, follows, chat opening, and profile routing. `AppDataContext.tsx` owns normalized users/posts/timelines/chat state, WebSocket event application, chat optimistic messages, typing signals, and feed hydration.

### Database Involvement
The frontend never accesses the database directly. It depends on backend API response models and normalizes them into local `Student`, `Opportunity`, `ChatConversation`, and notification types.

### Security Considerations
Tokens are stored in localStorage (`campuslink.auth.session`, `campuslink.admin.session`). This is simple but vulnerable to XSS token theft. Frontend route protection depends on context state; backend authorization is the real security boundary.

### Performance Considerations
Good: normalized state, stale/fresh checks, request deduping, memory/persistent cache, chat pagination, lazy older-message loading, optimistic chat sends. Risks: `App.tsx` is very large, which makes re-render reasoning and maintenance harder. Feed page size is set to `3` in `App.tsx`, which is safe but may feel underfilled.

### Current Limitations/Issues
- No React Router; browser routing is manually managed in `App.tsx`.
- Very large root component combines navigation, API orchestration, and business logic.
- Main app and admin use different data-fetching patterns.
- Accessibility is partly inherited from Radix, but custom interactions like chat long press/context menus need manual keyboard/a11y review.
- Some settings handler code logs updates, while detailed setting persistence exists inside `SettingsPage` and auth APIs.

### Suggested Improvements
- Introduce React Router or a small route state abstraction.
- Split `App.tsx` into feature controllers/hooks.
- Move feed/comment logic into dedicated hooks.
- Use a shared API error/result type.
- Standardize React Query or the custom store, rather than mixing approaches across product/admin.

---

## 4. Backend Architecture

### Purpose
The backend provides REST APIs, authentication, authorization, database persistence, media uploads, email workflows, notification fanout, WebSocket realtime events, caching, admin moderation, and health checks.

### User Flow
Requests enter `backend/server/src/app.ts`, pass CORS/body parsing, route module mounting, then per-route middleware such as `authenticateToken`, `requireOwnUser`, `requireAdmin`, `multer`, and `chatMessageRateLimiter`.

### Technical Implementation
`server.ts` loads env, creates HTTP server, attaches WebSocket server, starts cache/social schedulers, and listens on `PORT` default `4000`. Route files are organized by domain: auth, users, posts, search, network, notifications, chat, clubs, groupChat, admin.

### Technologies Used
Express, Prisma client, PostgreSQL, ws, multer, bcryptjs, jsonwebtoken, S3 SDK, Resend, web-push, Upstash Redis helper.

### Backend Logic
Most backend operations use parameterized `prisma.$queryRaw` SQL. Some places use Prisma model APIs, especially message deletion. Auth middleware verifies JWT and checks `user_sessions.revoked_at IS NULL`. Admin middleware requires a matching `admin_accounts` record.

### Frontend Logic
Frontend modules call backend through typed API wrapper functions. Admin frontend calls generic `apiAdminGet`, `apiAdminPost`, and `apiAdminDelete`.

### Database Involvement
Every major route interacts with PostgreSQL. Caches are used to reduce repeated expensive reads for feed, chat, user summaries, club permissions, and social insights.

### Security Considerations
Good: parameterized SQL, JWT secret length enforcement, session revocation, password hashing, admin route guard, CORS allowlist, file size limits. Weak: no universal rate limiter, no CSRF model for bearer token, localStorage tokens, manual validation, upload MIME trust, and no clearly enforced malware scanning.

### Performance Considerations
Good: cache utilities, Redis fanout, conversation list cache, recent message cache, feed cache. Risk: many raw SQL aggregate subqueries per post/list, offset pagination, and route files growing very large.

### Current Limitations/Issues
- Centralized error handler is not present; handlers repeat try/catch.
- Route files are large, especially `users.ts`, `posts.ts`, and `admin.ts`.
- Validation is scattered.
- Schema drift exists between migrations and Prisma schema (`admin_settings`, `group_add_preference`).

### Suggested Improvements
- Add central error middleware and typed controller/service separation.
- Add Zod schemas for all request bodies/query params.
- Align Prisma schema with all migration-managed tables/columns.
- Add integration tests around auth, chat, admin, uploads, and verification.

---

## 5. Database Design

### Purpose
The database models a campus network: identity, profiles, social graph, clubs, posts, chat, notifications, admin moderation, and verification.

### User Flow
User records are created through signup. Student profile or alumni profile rows extend the base user. Social actions create follows, requests, posts, comments, likes, saves, chats, messages, notifications, reports, and audit logs.

### Technical Implementation
Primary schema is `backend/prisma/schema.prisma`. PostgreSQL enums model user type, follow request status, post type, opportunity type, visibility, club roles/privacy, chat type/roles, admin roles/severity/status, verification states, auth provider, announcement status, and message type.

### Technologies Used
PostgreSQL UUID primary keys, Prisma schema/migrations, JSONB fields for flexible data such as reactions, notification settings, document URLs, announcement audiences, and admin metadata.

### Backend Logic
The backend uses raw SQL heavily for joins, counts, aggregation, and access checks. Deletion often relies on cascade behavior declared in relations or database migrations.

### Frontend Logic
Frontend receives hydrated response objects instead of database rows.

### Database Involvement
Core entities:
- User: base account identity, credentials, privacy, verification, presence.
- StudentProfile / AlumniProfile: role-specific details.
- UserSession: revocable auth sessions and device history.
- UserSetting: notification/privacy preferences.
- UserSkill, UserCertification, UserProject, UserExperience, UserSociety, UserAchievement: profile portfolio.
- FollowRequest / Follow: network graph.
- Club, ClubMembership, ClubCategory, ClubTag, ClubMemberRestriction: club system.
- Post, PostMedia, PostLike, PostComment, PostCommentLike, PostSave, Hashtag, PostHashtag: feed/social system.
- Chat, ChatParticipant, Message, MessageAttachment: chat system.
- Notification, UserPushSubscription: notification system.
- AdminAccount, AdminAuditLog, AdminReport, AdminReportNote, AdminVerificationRequest, AdminAnnouncement: moderation/admin system.

### Security Considerations
Password hashes are stored in `users.password_hash`. Verification proof URLs are stored in `admin_verification_requests.document_urls`, implying proof objects are externally accessible if public S3 URLs are used. Admin audit logs support accountability.

### Performance Considerations
Indexes exist on many foreign keys and common filters. Potential missing/weak areas:
- `messages` has `idx_messages_chat_id`, but cursor queries order by `(created_at, message_id)` and would benefit from composite `(chat_id, created_at DESC, message_id DESC)`.
- `posts` has `created_at`, `author_user_id`, `club_id`, `post_type`; feed queries may benefit from composite indexes involving visibility and author.
- `notifications` queries sort by `created_at` per user and may benefit from `(user_id, created_at DESC)` and `(user_id, is_read, created_at DESC)`.
- Admin reports may benefit from compound status/severity/created_at indexes.

### Current Limitations/Issues
- `admin_settings` exists in migration but not Prisma schema.
- `group_add_preference` exists in migration but not Prisma schema.
- Some soft-delete columns exist (`deleted_at`, `hidden_at`) but many route actions hard-delete content.
- Proof/document storage access policy is not documented in schema.

### Suggested ER Diagram Description
Place `User` at the center. Connect one-to-one to `StudentProfile`, `AlumniProfile`, `UserSetting`, `AdminAccount`; one-to-many to sessions, profile portfolio rows, posts, comments, notifications, push subscriptions, messages, club memberships, and reports. Model `Follow` as a self-referential many-to-many over users. Model `Club` as one-to-many with memberships and posts. Model `Post` as one-to-many with media/comments and many-to-many with hashtags. Model `Chat` as many-to-many with users through `ChatParticipant`, and one-to-many with messages and attachments. Model admin reports and verification requests as moderation records tied to users/clubs/posts.

### Suggested Database Chapter
The database chapter should explain base identity, role-specific profile tables, normalized social graph tables, content and engagement tables, realtime chat persistence, admin/moderation tables, notification tables, and indexing strategy.

---

## 6. Authentication and User Management

### Purpose
Authentication identifies users, differentiates student/alumni onboarding, manages sessions, supports password reset/change, supports Google sign-in, and gates admin access.

### User Flow
Login: email/password -> password verified -> session row created -> JWT issued -> frontend stores token -> profile fetched. Signup: user chooses student/alumni -> email verification or Google -> onboarding session -> role-specific completion. Alumni accounts enter pending review instead of immediate access.

### Technical Implementation
Auth files:
- `backend/server/src/routes/auth.ts`
- `backend/server/src/lib/auth.ts`
- `backend/server/src/middleware/authenticateToken.ts`
- `backend/server/src/middleware/validatePassword.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/AuthPage.tsx`

### Technologies Used
JWT, bcryptjs, crypto UUID/random tokens, Redis cache for magic/password reset tokens and rate windows, Resend email, Google tokeninfo verification.

### Backend Logic
`signAuthToken()` signs `{ userId, email, username, type, sessionId }`. `authenticateToken` verifies the JWT and confirms the session exists and is not revoked. Passwords use bcrypt salt rounds 12, with legacy SHA-256 fallback in `verifyPassword`.

### Frontend Logic
`AuthContext` persists token/user ID in localStorage, fetches profile on initialization, exposes login/signup/google/password flows, and redirects admin users to `/admin`.

### Database Involvement
`users`, `student_profiles`, `alumni_profiles`, `user_sessions`, `user_settings`, `auth_onboarding_sessions`, `admin_verification_requests`, and `admin_accounts`.

### Student Onboarding
Students must use allowed institutional email. After verification/onboarding, a user and `student_profiles` row are created. Google student signups can set `verification_state = student_google_verified`; magic-link student signup marks `verified_at` but may leave verification state null.

### Alumni Onboarding
Alumni provide branch, graduation year, current status, and proof files. Proof files upload to S3-compatible storage. The user is created/updated with `verification_state = alumni_pending_review`, and an `admin_verification_requests` row stores proof URLs and profile preview. The response is pending verification, not a login session.

### Password Reset / Change
Password reset sends email link, exchanges an exchange code for a short JWT reset token, then updates password. Password change requires verifying current password first, receives a short password-change JWT, then updates password.

### Security Considerations
Existing protections: bcrypt, JWT secret length check, database-backed session revocation, password complexity, signup/password reset throttling through Redis keys, Google token audience/email verification, admin account check.

### Performance Considerations
Auth calls are small. Redis improves token/counter lookup when configured. If Redis is absent, flows using Redis-backed cache may not work as intended for magic/password token persistence.

### Current Limitations/Issues
- Tokens are stored in localStorage.
- No refresh token rotation.
- No MFA.
- No account lockout for password login found in the inspected code.
- Google ID token verification uses Google `tokeninfo` endpoint via network call instead of local JWT verification/cert cache.
- Alumni proof files rely on MIME checks and storage; no antivirus or document authenticity verification.

### Suggested Improvements
- Move tokens to HttpOnly Secure SameSite cookies or add stronger XSS controls.
- Add login rate limiting and account lockout.
- Add MFA for admins.
- Use Google auth library for ID token verification.
- Add audit logs for sensitive user auth changes.

---

## 7. Feed and Social System

### Purpose
The feed lets users create, view, like, save, comment, reply, search, and receive realtime updates for posts, opportunities, events, projects, and club activity.

### User Flow
Authenticated user opens feed -> frontend fetches `/posts/feed` -> user creates post through modal -> backend stores post/media/hashtags -> caches update -> WebSocket event informs recipients -> frontend refreshes/patches state.

### Technical Implementation
Backend: `routes/posts.ts`, `routes/users.ts` for `/:userId/posts`, `lib/feedCache.ts`, `lib/notifications.ts`, `lib/realtime.ts`. Frontend: `FeedPage.tsx`, `CreateUnifiedPostModal.tsx`, `postsApi.ts`, `AppDataContext.tsx`, `App.tsx`.

### Technologies Used
Express, PostgreSQL, Prisma raw SQL, multer, S3 storage, WebSocket feed events, Redis cache, frontend cache.

### Backend Logic
Feed routes are authenticated. `/posts/feed` uses limit and offset/cursor-as-offset. Post creation validates type/visibility, uploads images, inserts post/media/hashtags in a transaction, updates caches, emits `feed:post_created`, creates notifications, and tracks hashtag/social insights. Likes/comments emit realtime events and create/update notifications.

### Frontend Logic
The frontend maps backend `UserPost` into local `Opportunity`. Feed timeline state stores post IDs and `postsById`. Comments and replies support paginated loading. Like/comment actions use optimistic UI in parts of `App.tsx`.

### Database Involvement
`posts`, `post_media`, `post_likes`, `post_saves`, `post_comments`, `post_comment_likes`, `hashtags`, `post_hashtags`, `follows`, `club_memberships`.

### Security Considerations
Access checks consider private accounts, follows, club membership, and post visibility. Post owner can edit/delete. Comment delete is allowed for comment author or post author. Missing: content sanitization policy is not clearly centralized; React escapes text, but stored content should still be validated for abuse/spam.

### Performance Considerations
Feed uses pagination and cache. Risk: `mapFeedRows` fetches comments for each post, which can become expensive. Offset pagination can slow on large feeds.

### Current Limitations/Issues
- No recommendation ranking beyond followed feed and social insight helpers found.
- No public report endpoint found for normal users.
- No full-text search index; search uses `ILIKE`.
- Feed page size in main app is very small (`FEED_PAGE_SIZE = 3`).

### Suggested Improvements
- Use cursor pagination based on `(created_at, post_id)`.
- Return comment previews only, not all comments, on feed list.
- Add post/report abuse endpoints for normal users.
- Add full-text search or trigram indexes.

---

## 8. Chat System

### Purpose
The chat system supports direct chats, message requests, group chats, image messages, replies, reactions, deletion, read states, typing indicators, and online/offline presence.

### User Flow
User starts chat -> backend checks messaging permission -> creates/reuses direct chat -> frontend opens conversation -> messages are fetched in pages -> sends are persisted through REST -> recipients receive WebSocket `chat:message`.

### Technical Implementation
Backend: `routes/chat.ts`, `routes/groupChat.ts`, `lib/chat.ts`, `lib/chatCache.ts`, `lib/realtime.ts`, `lib/encryption.ts`, `lib/chatPermissions.ts`. Frontend: `ChatPage.tsx`, `FloatingChat.tsx`, `chatApi.ts`, `chatUi.ts`, `AppDataContext.tsx`, `useBottomAnchoredChatScroll.ts`.

### Technologies Used
Express REST, ws, PostgreSQL, AES-256-GCM message encryption, multer, S3, Redis cache/fanout, frontend optimistic state.

### Backend Logic
`/chat/conversations` lists active/request chats. `/chat/conversations/:chatId/messages` pages messages by cursor. Text and image sends use `chatMessageRateLimiter` at 30 messages/minute/user. Direct chat permission requires mutual follow for direct active chat, public recipient for message request, and respects `allow_messages`.

### Frontend Logic
Messages are loaded newest-bottom. Older messages prepend via cursor. Sends are optimistic; temporary messages are removed on failure. Typing signals are sent over WebSocket with idle/heartbeat logic. Realtime events merge messages, read states, reactions, deletes, request acceptance, and presence.

### Database Involvement
`chats`, `chat_participants`, `messages`, `message_attachments`, `users`, `follows`, `user_settings`.

### Step-by-Step Message Send Flow
1. User types in `ChatPage`.
2. `AppDataContext.sendMessage` creates optimistic local message.
3. Frontend POSTs `/chat/conversations/:chatId/messages`.
4. `authenticateToken` validates JWT/session.
5. `chatMessageRateLimiter` checks 30/minute in memory.
6. Backend verifies participant and optional reply target.
7. Message content is encrypted with AES-256-GCM and inserted.
8. Chat caches and unread state are updated.
9. `emitChatMessage` sends `chat:message` to participants via WebSocket and optional Redis fanout.
10. Recipient frontend merges message and updates conversation preview.

### Security Considerations
Good: participant checks, rate limit, message encryption at rest, image-only check for chat uploads, delete-own-message-within-24h rule. Risks: encryption fallback derives key from `JWT_SECRET || fallback-secret-for-chat`; if neither `ENCRYPTION_KEY` nor `JWT_SECRET` is configured, a hardcoded fallback is used. MIME type alone is not strong file validation.

### Performance Considerations
Recent message and conversation caches reduce database work. Cursor pagination improves older-message loading. Redis stream polling supports multi-instance fanout but may add latency.

### Current Limitations/Issues
- In-memory rate limiter is per server instance only.
- `group_add_preference` reference is schema-inconsistent.
- No delivery receipts separate from read states.
- No server-side malware/image scanning.
- Group chat code should be tested against schema drift.

### Suggested Improvements
- Require `ENCRYPTION_KEY`; remove fallback secret.
- Use Redis-backed distributed rate limiting.
- Add composite message cursor index.
- Add upload content scanning and stricter file signature checks.

---

## 9. Profile and Settings System

### Purpose
Profiles show identity, academic/professional details, posts, projects, skills, achievements, experiences, societies, profile photos, and settings.

### User Flow
User opens own or other profile -> frontend fetches `/users/:userId` and profile sub-resources -> user can edit own profile/settings/media/password/sessions.

### Technical Implementation
Backend: `routes/users.ts`, `services/userProfile.ts`, storage helpers. Frontend: `ProfilePage.tsx`, `ProfilePostsPage.tsx`, `ProfileProjectsPage.tsx`, `SettingsPage.tsx`, profile upload UI components, profile API clients.

### Technologies Used
React forms, multer, S3, Prisma/PostgreSQL, JWT auth, local component state.

### Backend Logic
Routes under `/users/:userId` are authenticated. `requireOwnUser` guards writes. Settings update writes `users.is_private` and `user_settings`. Profile and cover photo endpoints support URL update or multipart upload. Password change and session revocation routes exist.

### Frontend Logic
Settings exposes account, security, notification, privacy, sessions, and account deletion flows. Profile pages render own/other profile and profile subpages.

### Database Involvement
`users`, `student_profiles`, `alumni_profiles`, `user_settings`, profile portfolio tables, `user_sessions`, `posts`, `user_projects`.

### Security Considerations
Write operations require owning user. Password change requires current password verification. Account deletion requires password. Media upload size limits exist.

### Performance Considerations
User summaries are cached. Profile subresources are separate API calls, which is simple but can create many requests.

### Current Limitations/Issues
- No device/session geographic verification beyond headers/IP labels.
- No export/download account data.
- Account deletion comment says no JWT/session validation, but `requireOwnUser` is present; comment is stale/confusing.

### Suggested Improvements
- Consolidate profile data fetching for first paint.
- Add avatar/cover image transformations.
- Add session revoke-all except current.
- Update stale comments.

---

## 10. Admin Panel and Moderation

### Purpose
Admin panel manages dashboard metrics, users, clubs, posts, reports, verification requests, analytics, announcements, logs, and settings.

### User Flow
Admin logs in through `/admin/auth/login` -> receives JWT -> frontend stores admin session -> `/admin/auth/session` validates -> AdminRoot navigation exposes modules.

### Technical Implementation
Backend: `routes/admin.ts`, `middleware/requireAdmin.ts`, `lib/admin.ts`. Frontend: `frontend/src/admin/AdminRoot.tsx`, `api.ts`, `session.ts`.

### Technologies Used
TanStack Query, Recharts, lucide-react, Express, PostgreSQL, admin audit logs, JWT.

### Backend Logic
Admin login verifies user/password and `admin_accounts`. After `router.use(authenticateToken, requireAdmin)`, all admin endpoints require admin access. Admin actions record audit logs and update users/clubs/posts/reports/verification/announcements/settings.

### Frontend Logic
`AdminRoot.tsx` is a large admin shell with nav pages, list filters, right drawers, charts, action buttons, settings forms, and toasts.

### Database Involvement
`admin_accounts`, `admin_audit_logs`, `admin_reports`, `admin_report_notes`, `admin_verification_requests`, `admin_announcements`, and migration-managed `admin_settings`.

### Security Considerations
Admin endpoints are protected by admin middleware. Weaknesses: no MFA, only one admin role (`SUPER_ADMIN`), admin API rate-limiting setting exists but enforcement was not found, admin token stored in localStorage.

### Performance Considerations
Pagination/filtering exists in admin list endpoints. Some analytics queries are complex and may need indexes/materialization for production scale.

### Current Limitations/Issues
- `admin_settings` missing from Prisma schema.
- Moderator roles are feature-flagged in settings but schema enum only defines `SUPER_ADMIN`.
- No export audit logs unless feature is later implemented.
- No visible scheduled announcement worker; announcements can be scheduled in data, but automatic publishing is not evident in inspected code.

### Suggested Improvements
- Add moderator/admin role hierarchy.
- Add MFA.
- Add admin API rate limiter.
- Add scheduled job for announcements.
- Align schema with admin settings table.

---

## 11. Content Moderation and Report System

### Purpose
Moderation supports admin review of reported users/posts/clubs, notes, status changes, verification decisions, content hiding/deletion/restoration, user warnings/suspension/ban, and audit trails.

### User Flow
Admin opens Reports -> filters by status/severity/target/assignee/date -> reviews detail -> adds note/status/action. Admin can also moderate directly from user/club/post detail.

### Technical Implementation
Admin report endpoints exist in `routes/admin.ts`. Admin reports are modeled in Prisma. Audit events are recorded through `recordAdminAuditLog`.

### Technologies Used
PostgreSQL, admin tables, Express, React admin UI.

### Backend Logic
Admin can list/detail/update reports, assign reports, add notes, and perform related moderation actions on targets.

### Frontend Logic
Admin UI provides report filters, drawers, timeline entries, action buttons, and notes.

### Database Involvement
`admin_reports`, `admin_report_notes`, `admin_audit_logs`, target tables (`users`, `posts`, `clubs`, comments).

### Security Considerations
Only admins can access moderation endpoints. Missing public report creation route means user-safety reporting may depend on seed/manual/admin-created rows unless another uninspected path exists; the inspected public routes do not expose report submission.

### Performance Considerations
Report list supports pagination and filters. Admin search uses SQL patterns and may need indexes/trigram search.

### Current Limitations/Issues
- Normal user report creation flow not found.
- Spam prevention beyond chat rate limit is not evident.
- Automated moderation/classification is not present.

### Suggested Improvements
- Add authenticated `/reports` public endpoint.
- Add abuse categories and evidence upload validation.
- Add spam/rate limits for posts/comments/follows.
- Add moderation queues and escalation policies.

---

## 12. Deployment and DevOps

### Purpose
Deployment configuration supports local development and frontend SPA hosting. Backend deployment is environment-driven but no platform-specific backend manifest was found.

### User Flow
Local dev: install frontend/backend dependencies separately, run `npm run dev` in each. Frontend defaults to `http://localhost:4000` API when no `VITE_API_URL` is set and host is localhost.

### Technical Implementation
- Frontend Vite build output: `frontend/build`.
- Vite dev server: port `3000`.
- Backend dev: `tsx watch server/src/server.ts`.
- Backend start: `node server/dist/server.js`.
- Frontend Vercel rewrite: all routes fall back to `/index.html`.

### Technologies Used
Vite, Vercel-style SPA routing, Prisma migrations, environment variables.

### Backend Logic
CORS allows localhost 3000/5173 plus comma-separated `CORS_ORIGINS`. Server uses `PORT`, `DATABASE_URL`, JWT/email/storage/push/cache env vars.

### Frontend Logic
`resolveApiBaseUrl()` reads `VITE_API_URL`. Without it in production, API calls are same-origin/empty base, which only works if backend is reverse-proxied under the same domain.

### Database Involvement
`backend/prisma.config.ts` reads `DATABASE_URL`; migrations live in `backend/prisma/migrations`.

### Security Considerations
CORS allowlist is present. HTTPS is not configured in repo; expected to be handled by hosting. Secrets are env-driven and not committed.

### Performance Considerations
Frontend build is static. Backend scaling requires Redis configured for cross-instance WebSocket fanout/cache consistency.

### Current Limitations/Issues
- No backend hosting config found.
- No Dockerfile/docker-compose found.
- No CI/CD workflow found.
- No production DNS records found.
- No reverse proxy config found.
- Frontend and backend production communication depends on correct `VITE_API_URL` or same-origin proxy.

### Suggested Improvements
- Add deployment architecture diagram and `.env.example`.
- Add Docker Compose for local Postgres/Redis/backend/frontend.
- Add GitHub Actions build/test pipeline.
- Document Vercel frontend and backend hosting provider separately.
- Add health check monitoring.

---

## 13. Security Analysis

| Area | Existing Protection | Vulnerability / Risk | Severity | Suggested Fix |
| ---- | ------------------- | -------------------- | -------- | ------------- |
| Passwords | bcryptjs, complexity regex | Legacy SHA-256 fallback accepts old hashes | Medium | Migrate legacy hashes on login |
| JWT | Secret length check, expiry | localStorage token theft via XSS | High | HttpOnly Secure SameSite cookies or hardened CSP |
| Sessions | DB-backed revocation | No refresh rotation | Medium | Add refresh/session rotation |
| Login | Password verification | No login rate limiter found | High | Add IP/account rate limiting |
| Magic/password links | Redis TTL/counters | If Redis missing, flows may fail | Medium | Require Redis or DB-backed tokens |
| SQL injection | Parameterized `$queryRaw` mostly | Some `$queryRawUnsafe` in admin with parameters; must audit carefully | Medium | Prefer safe query builder or strict templates |
| XSS | React escapes text | Token storage amplifies XSS impact | High | CSP, sanitize rich content, cookie auth |
| CSRF | Bearer tokens not automatically sent by browser | If moved to cookies, CSRF must be handled | Low now / High later | SameSite + CSRF tokens |
| File upload | multer limits, MIME checks | MIME spoofing, no scanning | High | Check magic bytes, AV scan, private proof storage |
| WebSocket | JWT token checked, session checked | Token in query string may leak in logs | Medium | Use short socket token or subprotocol/header where possible |
| Admin | requireAdmin middleware | No MFA, single role | High | MFA and role-based admin permissions |
| CORS | allowlist | Misconfigured env can expose API | Medium | Strict production origin list |
| Chat encryption | AES-256-GCM | hardcoded fallback if env missing | High | Require `ENCRYPTION_KEY` |
| Rate limiting | Chat message limiter | No global rate limit | High | Redis-backed route/IP limiters |

### Current Limitations/Issues
The largest security gaps before production are localStorage tokens, missing broad rate limiting, upload hardening, admin MFA absence, and encryption fallback.

---

## 14. Performance Analysis

### Purpose
Evaluate responsiveness and scalability of feed, chat, rendering, database, realtime, images, and API responses.

### User Flow
Users repeatedly scroll feeds, open chat, search users/clubs/hashtags, receive realtime events, and upload media.

### Technical Implementation
Frontend cache has memory/persistent layers and stale handling. Backend has optional Redis cache and stream fanout. Chat uses recent-message cache, cursor pagination, and conversation preview cache.

### Technologies Used
IndexedDB/local persistent cache utilities, Upstash Redis REST, WebSocket, PostgreSQL indexes, frontend optimistic updates.

### Backend Logic
Caching functions wrap feed/chat/user/club state. Social insights schedulers recompute trending/suggestions at configurable intervals.

### Frontend Logic
`useSyncExternalStore` avoids context-wide rerenders for selected data. Chat older-message loading prepends pages. Feed uses scroll trigger and small page size.

### Database Involvement
Heavy joins and aggregate counts exist across feed/admin/search/chat. Indexes are present but composite query-specific indexes should be added.

### Security Considerations
Caching must not leak private/club-only content; access-aware cache invalidation is used but requires tests.

### Performance Considerations
Bottlenecks:
- Feed hydrates comments per post.
- Offset pagination for feed/search/admin can degrade.
- Admin analytics may be expensive.
- WebSocket server memory maps grow with active users.
- S3 public original images are not visibly transformed/resized.

### Current Limitations/Issues
- No bundle analysis.
- No server load tests.
- No DB query plans.
- No image resizing/CDN transformation.

### Suggested Improvements
- Add composite indexes and EXPLAIN analysis.
- Add thumbnail generation.
- Add infinite feed cursor pagination.
- Add Redis distributed rate limiting and presence TTLs.
- Split frontend chunks/routes.

---

## 15. UI/UX Analysis

### Purpose
Assess whether the app provides clear campus social workflows.

### User Flow
Main app uses top navigation and tab-like sections: feed, search, network, chat, clubs, profile, notifications, settings. Feed uses left profile card and right suggestions on larger screens. Floating chat appears outside full chat.

### Technical Implementation
Responsive layouts use utility classes. Radix components provide base accessibility for dialogs/menus. Admin UI uses dense dashboard/table/drawer layouts.

### Technologies Used
React, Tailwind-like classes, Radix UI, lucide-react, Sonner, Recharts.

### Backend Logic
UI reflects backend permissions: own profile edit, own post edit/delete, follow states, message requests, club roles, admin actions.

### Frontend Logic
Components handle loading states, empty states, toasts, modals, and mobile-specific settings/chat behavior.

### Database Involvement
UI reads hydrated models from the database through APIs.

### Security Considerations
UI cannot be trusted as authorization. Backend checks are present for protected writes.

### Performance Considerations
Large components can affect rendering and maintainability. Images need optimization.

### Good UX Choices
- Dedicated student/alumni onboarding.
- Pending alumni verification state.
- Floating chat access.
- Admin right-drawer detail review.
- Session/device management in settings.
- Realtime notifications/messages improve perceived responsiveness.

### Weak UX Areas
- Manual tab routing can make deep links fragile.
- Feed page size may show too little content.
- Admin UI is very large in one file and may be hard to evolve.
- Accessibility needs formal keyboard/screen-reader testing.

### Suggested Improvements
- Add route-aware deep links for every feature.
- Add skeleton consistency across all pages.
- Add screen-reader labels and keyboard tests for chat/media/admin actions.
- Add image crop/preview consistency.

---

## 16. Feature Completeness Audit

| Feature | Frontend Status | Backend Status | Database Status | Complete? | Issues |
| ------- | --------------- | -------------- | --------------- | --------- | ------ |
| Email/password login | Implemented | Implemented | `users`, `user_sessions` | Yes | No login rate limiter found |
| Student signup | Implemented | Implemented | `users`, `student_profiles`, onboarding | Mostly | Magic-link state depends on Redis |
| Alumni signup | Implemented | Implemented | alumni profile + verification requests | Mostly | Requires admin approval; proof scanning absent |
| Google auth | Implemented | Implemented | Google subject field | Mostly | Uses tokeninfo network verification |
| Magic link signup | Implemented | Implemented | onboarding session + Redis | Mostly | Redis required for token cache |
| Password reset | Implemented | Implemented | users + Redis token state | Mostly | No UI hardening concerns beyond standard flow |
| Session list/revoke | Implemented | Implemented | `user_sessions` | Yes | No revoke-all |
| Feed list | Implemented | Implemented | posts tables | Yes | Offset pagination; comment hydration cost |
| Post creation | Implemented | Implemented | posts/media/hashtags | Yes | Upload validation basic |
| Post media upload | Implemented | Implemented | S3 URLs in DB | Yes | No image processing/scanning |
| Likes/saves | Implemented | Implemented | likes/saves tables | Yes | Realtime for likes, not saves |
| Comments/replies | Implemented | Implemented | `post_comments` | Yes | Spam/rate limit absent |
| Hashtag pages | Implemented | Implemented | hashtags mapping | Yes | Search via pattern only |
| Search users | Implemented | Implemented | users/profile summaries | Yes | ILIKE, no full-text |
| Search hashtags/clubs | Implemented | Implemented | hashtags/clubs | Yes | ILIKE, limited ranking |
| Follow graph | Implemented | Implemented | follows/requests | Yes | Social recommendations depend on scheduler/cache |
| Suggestions | Implemented | Implemented | follows/cache insights | Mostly | Details depend on `socialInsights` recompute |
| Direct chat | Implemented | Implemented | chats/participants/messages | Yes | Message request rules complex |
| Group chat | Implemented | Implemented | chat roles/tables | Mostly | `group_add_preference` schema drift |
| Chat media | Implemented | Implemented | attachments + S3 | Yes | Basic MIME checks |
| Typing indicators | Implemented | Implemented | WebSocket only | Yes | No persistence needed |
| Read receipts | Implemented | Implemented | `last_read_message_id` | Yes | Delivery receipts absent |
| Message reactions | Implemented | Implemented | JSONB reactions | Yes | Emoji validation minimal |
| Message delete | Implemented | Implemented | soft delete | Yes | Only own messages within 24h |
| Presence | Implemented | Implemented | users/cache/socket map | Mostly | Multi-instance presence needs Redis/cache correctness |
| Profiles | Implemented | Implemented | profile tables | Yes | Many separate calls |
| Skills/certs/projects/etc. | Implemented | Implemented | profile portfolio tables | Yes | Validation basic |
| Profile/cover uploads | Implemented | Implemented | S3 URL fields | Yes | No server-side image transform |
| Settings | Implemented | Implemented | `user_settings` | Yes | Missing group preference in Prisma schema |
| Notifications | Implemented | Implemented | `notifications` | Yes | 100 item limit, no pagination cursor |
| Push notifications | Implemented | Implemented | push subscriptions | Mostly | Requires VAPID; click always opens notifications |
| Clubs | Implemented | Implemented | club tables | Yes | Full route not exhaustively audited here but present |
| Club posts | Implemented | Implemented | `posts.club_id` | Yes | Access/caches require tests |
| Admin login | Implemented | Implemented | `admin_accounts` | Yes | No MFA |
| Admin dashboard | Implemented | Implemented | aggregates | Yes | Query cost risk |
| Admin users | Implemented | Implemented | users/audit | Yes | Single admin role |
| Admin clubs | Implemented | Implemented | clubs/audit | Yes | Needs role expansion |
| Admin posts/comments | Implemented | Implemented | posts/comments/audit | Yes | Some actions hard-delete |
| Admin reports | Implemented | Implemented | reports/notes | Mostly | User-facing report creation not found |
| Admin verification | Implemented | Implemented | verification requests | Yes | Email decision flow depends on Resend |
| Admin analytics | Implemented | Implemented | aggregate queries | Yes | Could be expensive |
| Admin announcements | Implemented | Implemented | announcements | Partial | Scheduled publishing worker not found |
| Admin settings | Implemented | Implemented | migration table | Partial | Missing from Prisma schema |
| Audit logs | Implemented | Implemented | `admin_audit_logs` | Yes | Export feature flag only |
| Deployment frontend | Configured | N/A | N/A | Partial | Vercel-style SPA rewrite only |
| Deployment backend | N/A | Env-driven | DB env-driven | Partial | No hosting manifest |
| Health endpoint | N/A | Implemented | DB/route probes | Yes | Good for monitoring |

---

## 17. Report Generation Material

### Suggested Table of Contents
1. Abstract
2. Introduction
3. Problem Statement
4. Objectives
5. Literature/Existing System Review
6. Requirement Analysis
7. System Architecture
8. Technology Stack
9. Database Design
10. Authentication and Verification
11. Feed and Social Features
12. Chat and Realtime Communication
13. Profile and Settings
14. Club Management
15. Admin and Moderation
16. Security Analysis
17. Performance Analysis
18. Deployment
19. Testing and Validation
20. Results and Screenshots
21. Limitations
22. Future Scope
23. Conclusion

### Suggested Screenshots
Login/signup role selection, student verification, alumni proof upload/pending screen, feed, create post modal, post detail/comments, profile page, settings security/sessions, network page, chat page with typing/media, clubs page, club detail, notifications page, admin dashboard, admin verification requests, admin reports, admin analytics, admin logs.

### Suggested Diagrams
- High-level architecture: Browser SPA -> Express API -> PostgreSQL/S3/Redis/Resend/Web Push.
- ER diagram from Section 5.
- Authentication sequence diagrams for student and alumni.
- Chat message sequence diagram.
- Feed post creation flowchart.
- Admin verification workflow.
- WebSocket event flow diagram.
- Deployment diagram for local and production.

### Viva Questions with Answers
1. Why separate StudentProfile and AlumniProfile?  
Because both share base identity fields in `users`, but have different role-specific data: students need branch/year, alumni need branch/passing year/current status and verification review.

2. Why use WebSockets?  
For realtime notifications, feed changes, chat messages, typing, read receipts, reactions, deletes, and presence without repeated polling.

3. How are passwords secured?  
Passwords are hashed with bcryptjs using 12 salt rounds. The code also supports legacy SHA-256 verification for older hashes.

4. How is alumni verification different from student verification?  
Students can complete onboarding after institutional email verification. Alumni upload proof files and are placed in `alumni_pending_review` until an admin approves/rejects/requests more info.

5. How is authorization enforced?  
JWT middleware verifies token and active session. Ownership checks guard user writes. Admin middleware verifies `admin_accounts`.

6. Why PostgreSQL?  
The platform has strongly relational data: users, follows, memberships, posts, comments, chats, reports, and verification records.

7. What is the biggest production risk?  
Security hardening: localStorage JWTs, upload validation, missing broad rate limiting, admin MFA absence, and schema drift.

8. What makes the project academically strong?  
It combines full-stack CRUD, realtime systems, verification workflows, moderation/admin tooling, media storage, notifications, caching, and relational database design.

### Possible Examiner Questions
- Explain student vs alumni onboarding technically.
- Explain how a message goes from sender to receiver.
- Explain how private profiles affect feed/search/chat.
- Explain admin verification approval.
- Explain cache invalidation for feed/chat.
- Explain why raw SQL was used and its tradeoffs.
- Explain how the system handles media uploads.
- Explain limitations before production deployment.

### Technical Justification Answers
- JWT plus DB sessions allows stateless request auth while preserving revocation.
- S3 storage prevents database bloat from binary files.
- Redis is optional to keep local dev simple but useful for production scale.
- Admin audit logs support accountability and moderation traceability.
- Separate admin frontend keeps operational UI distinct from user UX.

---

## 18. Final Project Evaluation

### Overall Architecture Quality Review
CampusLynk is a strong final-year project with real full-stack depth. It is not a shallow UI mockup: the repository contains serious backend logic, normalized schema design, realtime chat, verification systems, media uploads, notifications, caching, and admin moderation.

### Scalability Review
The architecture can scale moderately if PostgreSQL indexes, Redis fanout, and object storage are configured correctly. It needs cursor pagination, distributed rate limits, image processing, and query optimization for larger production use.

### Maintainability Review
Domain separation exists by route/lib/component folders, but several files are very large and mix orchestration with business logic. The project would benefit from service layers, validators, smaller frontend hooks, and route contracts.

### Production Readiness Review
Good for academic demo and controlled beta. Not fully production-ready until security hardening, schema drift cleanup, deployment documentation, CI/testing, and monitoring are added.

### Security Readiness Review
Baseline protections exist, but production security needs token storage hardening, MFA for admins, upload scanning, distributed rate limiting, stricter encryption configuration, CSP, and complete validation.

### Academic Project Quality Evaluation
High. The project demonstrates frontend/backend integration, relational design, realtime communication, admin workflows, verification, caching, uploads, and security considerations. The honest limitations are also valuable for viva discussion.

### Top Strengths
- Complete student/alumni distinction with verification.
- Rich chat system with realtime events, typing, read states, reactions, media, and encryption.
- Comprehensive admin dashboard and moderation system.
- Strong relational schema covering many real platform needs.
- S3, Resend, web-push, Redis, and WebSocket integrations.
- Frontend cache/state system is more advanced than typical academic projects.

### Top Weaknesses
- Schema drift between migrations and Prisma schema.
- Security hardening gaps.
- Very large route/component files.
- Limited test/CI/deployment evidence.
- Some features appear admin-only or partial, such as report submission and scheduled announcements.

### Highest Priority Fixes Before Submission
1. Align Prisma schema with migrations: add `admin_settings` model and `group_add_preference` or remove dependent code.
2. Add `.env.example` documenting every required variable.
3. Add screenshots and diagrams from Section 17.
4. Add a simple test script or manual test evidence for auth, feed, chat, and admin verification.
5. Document deployment environment clearly.
6. Add user-facing report submission or state clearly that reports are admin-seeded/admin-managed.

### Features That Would Impress Examiners
- Alumni proof verification with admin approval/rejection/more-info flow.
- Realtime chat with message requests, typing, read receipts, reactions, and encrypted content.
- Admin analytics, reports, verification, announcements, and audit logs.
- Web push notifications and WebSocket notification fanout.
- Club system with roles, privacy, and linked club posts/chat support.

### Features Needing Polishing Before Demo
- Ensure alumni verification email flow works with Resend env.
- Ensure S3 upload env is configured.
- Ensure WebSocket URL/token connection works in deployed frontend.
- Demo admin account creation/login reliably.
- Preload sample users/posts/chats/clubs for a smooth walkthrough.
- Resolve schema drift so migrations and Prisma generation are clean.

---

## Appendix A: Key Source Files

- `backend/server/src/app.ts` - Express app, CORS, route mounting, health.
- `backend/server/src/server.ts` - HTTP server, WebSocket bootstrap, schedulers.
- `backend/server/src/routes/auth.ts` - login, signup, Google, magic links, password reset, sessions, alumni proof.
- `backend/server/src/routes/users.ts` - profiles, settings, media, password, portfolio, post creation.
- `backend/server/src/routes/posts.ts` - feed, post detail, likes, saves, comments, replies, hashtags.
- `backend/server/src/routes/chat.ts` - conversations, messages, media, reactions, read states, requests.
- `backend/server/src/routes/groupChat.ts` - group chat lifecycle.
- `backend/server/src/routes/clubs.ts` - club categories, club CRUD, memberships, club posts.
- `backend/server/src/routes/admin.ts` - admin dashboard, users, clubs, posts, reports, verification, analytics, announcements, logs, settings.
- `backend/server/src/lib/realtime.ts` - WebSocket server and event fanout.
- `backend/server/src/lib/cache.ts` - Upstash Redis REST/cache/stream helpers.
- `backend/server/src/lib/objectStorage.ts` - S3-compatible storage.
- `backend/server/src/lib/notifications.ts` - notification creation/fanout.
- `backend/server/src/lib/push.ts` - web push delivery.
- `backend/server/src/lib/encryption.ts` - AES-GCM chat content encryption.
- `backend/prisma/schema.prisma` - primary schema.
- `frontend/src/App.tsx` - main SPA controller.
- `frontend/src/context/AuthContext.tsx` - auth/session context.
- `frontend/src/context/AppDataContext.tsx` - normalized app/chat/feed store.
- `frontend/src/admin/AdminRoot.tsx` - admin UI shell.
- `frontend/src/lib/*Api.ts` - frontend API clients.
- `frontend/src/cache/*` - frontend cache.
- `frontend/vercel.json` - SPA route fallback.
