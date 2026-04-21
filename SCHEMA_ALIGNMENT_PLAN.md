# Schema Alignment Plan

## Summary
This plan is about the database schema and its migrations, not backend or frontend feature implementation. The goal is to define a clean, normalized target schema that can support the full visible product surface of the website, and to execute schema migrations now. Application logic, APIs, and route behavior will be handled later.

Key constraints for this plan:

- There is no teacher role in the product and it should be removed from schema planning.
- Schema work is allowed to alter existing tables, columns, relationships, and naming.
- Destructive cleanup is allowed later, but must be confirmed before deleting existing schema artifacts or data.
- The target should be the cleanest normalized schema that covers current and intended product behavior visible in the codebase.

## Canonical Schema Direction
Use one canonical schema definition going forward, based around the backend database model and then synchronized outward.

Recommended direction:

- Keep `backend/prisma/schema.prisma` as the eventual canonical schema file because the backend config already points to it.
- Treat `prisma/schema.prisma`, hand-written SQL files, and old migrations as reference inputs only until cleanup is approved.
- Do not delete duplicate or legacy schema artifacts yet without explicit confirmation.

## Product-Scope Entities the Schema Must Cover
The target schema should be capable of supporting all visible website areas, even where logic is still mock-only today.

### Identity and account
- users
- authentication credentials
- account visibility
- active status / presence
- profile metadata
- privacy settings
- notification settings
- account preferences

### User profile
- core profile information
- academic identity for student/alumni users
- skills
- certifications
- projects
- experience
- societies / organizations
- achievements
- profile media references

### Social graph
- followers / following
- follow requests
- request status
- request lifecycle timestamps
- blocking or relationship moderation readiness if needed later

### Content and feed
- posts
- post media
- likes
- comments
- nested comments / replies
- hashtags / tags
- saved posts
- feed-relevant activity

### Clubs and communities
- clubs
- club memberships
- club roles
- club ownership/admin capability
- club posts or club activity

### Messaging
- one-to-one chats
- group chats
- chat participants
- messages
- message read state
- message attachments readiness

### Notifications and settings
- in-app notifications
- notification type/status
- per-user settings and preferences

## Teacher Removal
Teacher support should be removed from the schema plan entirely.

That means:

- no `teacherprofiles` table in the target schema
- no teacher user type in the target schema
- no teacher-related branching in future schema design

If teacher-specific artifacts exist in old SQL or backend code, they should be treated as legacy cleanup items for a later implementation batch.

## Schema-Only Scope vs Later Logic

### In scope now
- target table design
- normalization decisions
- key/foreign-key structure
- cardinality and relationship modeling
- status fields and lookup strategy
- naming cleanup
- identifying which existing tables should be altered, replaced, merged, or retired

### Explicitly later
- route implementation
- service/business logic
- auth flow rewiring
- frontend integration
- destructive cleanup execution

## Recommended Normalized Target Schema

### 1. Users and profile foundation

#### `users`
Core account identity.

Recommended columns:

- `user_id` UUID primary key
- `username` unique
- `email` unique
- `password_hash`
- `user_type` enum or constrained text
  - allowed values: `student`, `alumni`
- `bio`
- `headline`
- `profile_photo_url`
- `cover_photo_url`
- `is_private`
- `is_active`
- `is_online`
- `last_seen_at`
- `created_at`
- `updated_at`

Notes:

- `is_public` should become `is_private` or another clearer privacy field.
- Presence belongs here at the account level unless presence history is needed later.
- `user_type` should replace implicit role inference from separate tables alone.

#### `student_profiles`
Subtype table for student-specific academic data.

Recommended columns:

- `user_id` primary key and FK to `users`
- `branch`
- `year`
- `created_at`
- `updated_at`

#### `alumni_profiles`
Subtype table for alumni-specific academic data.

Recommended columns:

- `user_id` primary key and FK to `users`
- `branch`
- `passing_year`
- `current_status`
- `created_at`
- `updated_at`

### 2. User profile extensions

#### `user_skills`
User-owned skills as normalized rows.

Recommended columns:

- `user_skill_id` UUID primary key
- `user_id` FK to `users`
- `name`
- `created_at`

Constraint:

- unique `(user_id, name)`

#### `user_certifications`
User certifications.

Recommended columns:

- `certification_id` UUID primary key
- `user_id` FK to `users`
- `name`
- `issuer`
- `description`
- `credential_url`
- `image_url`
- `issued_at`
- `expires_at` nullable
- `created_at`
- `updated_at`

#### `user_projects`
Projects attached to user profiles.

Recommended columns:

- `project_id` UUID primary key
- `user_id` FK to `users`
- `title`
- `description`
- `source_url` nullable
- `demo_url` nullable
- `image_url` nullable
- `created_at`
- `updated_at`

#### `project_tags`
Normalized project tagging.

Recommended columns:

- `project_id` FK to `user_projects`
- `tag_name`

Primary key:

- `(project_id, tag_name)`

This is simpler than forcing global hashtag reuse for profile project tech stacks.

#### `user_experiences`
Professional/internship experiences.

Recommended columns:

- `experience_id` UUID primary key
- `user_id` FK to `users`
- `role_title`
- `organization`
- `description`
- `start_date`
- `end_date` nullable
- `is_current`
- `created_at`
- `updated_at`

#### `user_societies`
Societies/clubs/org affiliations shown on profile.

Recommended columns:

- `user_society_id` UUID primary key
- `user_id` FK to `users`
- `society_name`
- `role_name`
- `start_date` nullable
- `end_date` nullable
- `created_at`
- `updated_at`

#### `user_achievements`
Achievements on profile.

Recommended columns:

- `achievement_id` UUID primary key
- `user_id` FK to `users`
- `title`
- `description` nullable
- `achievement_year`
- `created_at`
- `updated_at`

### 3. Follow system

#### `follow_requests`
Pending and resolved follow requests.

Recommended columns:

- `follow_request_id` UUID primary key
- `requester_user_id` FK to `users`
- `target_user_id` FK to `users`
- `status`
  - allowed values: `pending`, `accepted`, `rejected`, `cancelled`
- `created_at`
- `responded_at` nullable
- `cancelled_at` nullable

Constraints:

- unique active request between requester and target
- requester cannot equal target

#### `follows`
Accepted follow relationships only.

Recommended columns:

- `follower_user_id` FK to `users`
- `followed_user_id` FK to `users`
- `created_at`

Primary key:

- `(follower_user_id, followed_user_id)`

Notes:

- Keep `follows` as accepted state only.
- Keep request history separate in `follow_requests`.

### 4. Posts and feed interactions

#### `posts`
Unified feed content.

Recommended columns:

- `post_id` UUID primary key
- `author_user_id` FK to `users`
- `club_id` nullable FK to `clubs`
- `post_type`
  - suggested values: `general`, `opportunity`, `event`, `club_activity`
- `opportunity_type` nullable
  - suggested values: `internship`, `hackathon`, `event`, `contest`, `club`
- `title` nullable
- `content_text`
- `event_date` nullable
- `location` nullable
- `external_url` nullable
- `visibility`
  - suggested values: `public`, `followers`, `club_members`
- `created_at`
- `updated_at`

#### `post_media`
Separate media records for posts.

Recommended columns:

- `post_media_id` UUID primary key
- `post_id` FK to `posts`
- `media_url`
- `media_type`
- `sort_order`
- `created_at`

#### `post_likes`
- `user_id` FK to `users`
- `post_id` FK to `posts`
- `created_at`

Primary key:

- `(user_id, post_id)`

#### `post_comments`
Supports nested replies.

Recommended columns:

- `comment_id` UUID primary key
- `post_id` FK to `posts`
- `author_user_id` FK to `users`
- `parent_comment_id` nullable self-FK
- `content`
- `created_at`
- `updated_at`

#### `post_saves`
Saved/bookmarked posts.

Recommended columns:

- `user_id` FK to `users`
- `post_id` FK to `posts`
- `created_at`

Primary key:

- `(user_id, post_id)`

#### `hashtags`
- `hashtag_id` UUID primary key
- `tag_name` unique
- `created_at`

#### `post_hashtags`
- `post_id` FK to `posts`
- `hashtag_id` FK to `hashtags`

Primary key:

- `(post_id, hashtag_id)`

### 5. Clubs

#### `clubs`
Core club/community entity.

Recommended columns:

- `club_id` UUID primary key
- `name` unique
- `description`
- `avatar_url` nullable
- `created_by_user_id` FK to `users`
- `created_at`
- `updated_at`

#### `club_memberships`
Normalized membership and role structure.

Recommended columns:

- `club_membership_id` UUID primary key
- `club_id` FK to `clubs`
- `user_id` FK to `users`
- `role`
  - suggested values: `owner`, `admin`, `member`
- `status`
  - suggested values: `active`, `pending`, `removed`, `left`
- `joined_at` nullable
- `created_at`
- `updated_at`

Constraint:

- unique `(club_id, user_id)`

This table covers:

- membership
- member role
- join state
- future approval workflow if clubs later need it

### 6. Chat and messaging

#### `chats`
Conversation container for both direct and group chats.

Recommended columns:

- `chat_id` UUID primary key
- `chat_type`
  - allowed values: `direct`, `group`
- `name` nullable
- `avatar_url` nullable
- `created_by_user_id` nullable FK to `users`
- `created_at`
- `updated_at`

#### `chat_participants`
Participants in each chat.

Recommended columns:

- `chat_participant_id` UUID primary key
- `chat_id` FK to `chats`
- `user_id` FK to `users`
- `role`
  - suggested values: `owner`, `admin`, `member`
- `joined_at`
- `left_at` nullable
- `last_read_message_id` nullable FK to `messages`
- `created_at`

Constraint:

- unique `(chat_id, user_id)`

Notes:

- This single structure supports both direct and group chat.
- For direct chats, enforce exactly two active participants at logic level later.

#### `messages`
Chat messages.

Recommended columns:

- `message_id` UUID primary key
- `chat_id` FK to `chats`
- `sender_user_id` FK to `users`
- `message_type`
  - suggested values: `text`, `image`, `file`, `system`
- `content`
- `reply_to_message_id` nullable self-FK
- `created_at`
- `updated_at`
- `deleted_at` nullable

#### `message_attachments`
Optional message attachments.

Recommended columns:

- `message_attachment_id` UUID primary key
- `message_id` FK to `messages`
- `file_url`
- `file_type`
- `created_at`

### 7. Notifications

#### `notifications`
In-app notification records.

Recommended columns:

- `notification_id` UUID primary key
- `user_id` FK to `users`
- `actor_user_id` nullable FK to `users`
- `notification_type`
- `title`
- `message`
- `entity_type` nullable
- `entity_id` nullable
- `is_read`
- `created_at`
- `read_at` nullable

This structure is flexible enough for:

- follows
- likes
- comments
- messages
- club activity
- opportunities

### 8. Settings and preferences

#### `user_settings`
One row per user for account-level preferences.

Recommended columns:

- `user_id` primary key and FK to `users`
- `email_notifications`
- `follow_request_notifications`
- `message_notifications`
- `opportunity_alerts`
- `club_update_notifications`
- `weekly_digest_enabled`
- `show_email`
- `show_projects`
- `allow_messages`
- `created_at`
- `updated_at`

Notes:

- Keep privacy and notification preferences centralized.
- Do not scatter them across unrelated tables unless needed later.

## Existing Schema Changes Recommended

### Keep but rename/refactor
- `users` should remain the anchor table.
- `follows`, `posts`, `comments`, and `likes` should be refactored into the target naming/structure rather than conceptually discarded.

### Likely replace or reshape
- `projects` should become `user_projects` or at least be reworked to match the profile-driven project model.
- `projecttags` should be simplified if global hashtag reuse is not needed for projects.
- `comments` should become `post_comments` for clarity.
- `likes` should become `post_likes` for clarity.

### Additions required
- `user_settings`
- `follow_requests`
- `post_saves`
- `post_media`
- `clubs`
- `club_memberships`
- `chats`
- `chat_participants`
- `messages`
- `message_attachments`
- `user_experiences`
- `user_societies`
- `user_achievements`
- `user_skills`
- `user_certifications`

### Legacy items to mark for later cleanup
- duplicate Prisma schema files
- old `Student` migration
- any teacher-related schema artifacts
- SQL files that no longer match the canonical schema

## Normalization Notes
- Use separate subtype tables for student and alumni data instead of nullable columns on `users`.
- Keep many-to-many relations in bridge tables.
- Keep accepted follows separate from follow request history.
- Keep club membership and role in one normalized membership table.
- Keep direct and group chat in one chat model with participant rows.
- Keep settings centralized in `user_settings`.
- Keep media in separate tables where one-to-many is expected.
- Avoid storing arrays in a single column where relational structure is clearer.

## Decisions Locked for Future Implementation
- No teacher role.
- Schema-first cleanup is allowed.
- Logic and routes come later.
- Full website coverage is required in the target schema, including currently mock-backed surfaces.
- Existing tables may be altered heavily if that leads to a cleaner normalized model.
- Destructive deletion should still be explicitly confirmed before execution.

## Migration Execution Direction
Migrations are part of the current schema work and should be done now.

That means:

- define the canonical target schema
- generate or write the schema migrations needed to reach it
- apply additive and structural schema changes needed for normalization
- plan data backfill where required as part of migration work

Still deferred until later:

- backend route changes
- frontend API rewiring
- authentication payload updates
- cleanup/deletion of obsolete tables and files after explicit confirmation
