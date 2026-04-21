# CampusLynk Codebase Reference

## Summary
CampusLynk is a student/alumni networking web application with a React frontend and an Express/PostgreSQL backend. The current codebase shows a much larger product surface in the UI than what is currently implemented end-to-end.

This reference document is meant to:

- describe the website as it exists in code today
- separate real implementation from mock/local-only behavior
- identify schema-relevant product entities
- serve as the reference for future database redesign

Important updated assumptions:

- There is no teacher role in the product.
- The current schema planning effort is schema-only; implementation logic comes later.
- A future schema may alter existing tables heavily in pursuit of a cleaner normalized design.

## Repository Structure
- `frontend/`: React + Vite application.
- `backend/`: Express server, Prisma client wiring, auth logic, and current route layer.
- `backend/prisma/schema.prisma`: backend-configured Prisma schema file.
- `prisma/schema.prisma`: duplicate Prisma schema file at repo root.
- `prisma/migrations/`: Prisma migration history.
- `database/`: hand-written SQL schema files, helper scripts, and dumps.

## Product Overview
The frontend presents CampusLynk as a campus social/networking platform with:

- student and alumni authentication
- profile pages
- projects, certifications, and skills
- feed posts and opportunities
- follow/follower relationships
- follow requests for private accounts
- search
- clubs and club memberships
- chat and group chat
- notifications
- settings and privacy controls

The backend currently implements only a subset of this.

## Frontend Architecture

### Entry and state model
The main entry is `frontend/src/App.tsx`.

The app currently combines:

- `AuthContext` for real authentication/session handling
- history-based tab navigation
- mock data for most social/product surfaces
- local component state for many user interactions

### Main user-facing pages
- `AuthPage`
- `FeedPage`
- `ProfilePage`
- `SearchPage`
- `NetworkPage`
- `ChatPage`
- `ClubsPage`
- `NotificationsPage`
- `SettingsPage`

### Frontend data sources

#### Real backend-backed flows
- auth
- current user profile fetch
- skills CRUD
- certifications CRUD

#### Wired in frontend but backend-missing
- projects CRUD API calls exist in the frontend, but matching backend routes do not exist yet

#### Mock-backed or local-only
- feed/opportunities
- clubs
- follows/follow requests
- conversations and chat messages
- notifications
- much of search behavior
- much of settings persistence
- several rich profile sections

## Backend Architecture

### Server shape
- Entry: `backend/server/src/server.ts`
- Express app: `backend/server/src/app.ts`
- Prisma client: `backend/server/src/prisma.ts`

Mounted routes:

- `/auth`
- `/users`
- `/health`

### Auth implementation
Implemented auth flows:

- `POST /auth/signup/student`
- `POST /auth/signup/alumni`
- `POST /auth/login`

Current auth behavior:

- JWT generation and verification
- password validation middleware
- bcrypt hashing with legacy SHA-256 compatibility
- student email restriction to `@gbpuat.ac.in`

### Current user/profile backend
The backend currently resolves profile information from:

- `users`
- `studentprofiles`
- `alumniprofiles`
- follow counts
- post counts

The backend currently exposes:

- `GET /users/:userId`
- `DELETE /users/:userId`
- skills CRUD endpoints
- certifications CRUD endpoints

The backend does not currently expose:

- project endpoints
- feed endpoints
- follow request endpoints
- club endpoints
- chat endpoints
- notification endpoints
- settings endpoints

## Current Domain Model Seen by the UI
The frontend type layer expects a larger domain than the backend currently supports.

Important UI entities include:

- users/students
- projects
- certifications
- skills
- experiences
- societies
- achievements
- opportunities/posts
- comments
- clubs
- messages
- chat conversations
- notifications
- groups

This matters because the future database schema should be designed for the visible product surface, not only the already-implemented backend subset.

## Database and Schema Sources

### Active backend Prisma configuration
`backend/prisma.config.ts` currently points to:

- schema: `backend/prisma/schema.prisma`
- migrations: `prisma/migrations`

### Current schema-related sources

#### `backend/prisma/schema.prisma`
Currently defines:

- `users`
- `posts`
- `comments`
- `likes`
- `follows`
- `hashtags`
- `posttags`
- `projects`
- `projecttags`

It does not currently define several entities already assumed elsewhere in the codebase, including:

- `studentprofiles`
- `alumniprofiles`
- `skills`
- `certifications`
- settings
- follow requests
- clubs
- chats
- notifications
- profile extension tables

#### `prisma/schema.prisma`
Currently duplicates the same schema structure, which creates drift risk.

#### `database/database_schema.sql`
Defines a SQL-first version of the older social schema, including:

- users
- student profiles
- alumni profiles
- posts
- follows
- likes
- comments
- hashtags
- post tags

It still does not define the broader set of entities visible in the frontend.

#### `database/migrate_normalize_users.sql`
Adds normalized user subtype tables for student and alumni-related data.

#### `prisma/migrations/20251202104220_init/migration.sql`
Contains an old `Student` table that does not match the current product/domain model.

## Feature Status Matrix

| Area | User-visible state | Backend status | Persistence status | Current classification |
| --- | --- | --- | --- | --- |
| Student signup | Present in UI | Implemented | Real DB-backed | Backend-backed |
| Alumni signup | Present in UI | Implemented | Real DB-backed | Backend-backed |
| Login/JWT session | Present in UI | Implemented | Real DB-backed | Backend-backed |
| Basic user profile fetch | Present in UI | Implemented | Real DB-backed | Backend-backed |
| Account deletion | Present in UI | Implemented | Real DB-backed | Backend-backed |
| Skills | Present in profile UI | Implemented route layer | Assumes table exists | Backend-backed if schema exists |
| Certifications | Present in profile UI | Implemented route layer | Assumes table exists | Backend-backed if schema exists |
| Projects | Present in profile UI | No backend route yet | Frontend expects persistence | Partially implemented |
| Feed/opportunities | Present in UI | No backend route | Mock/local | Frontend-only/mock-backed |
| Likes/comments on feed | Present in UI | No active feed API usage | Mock/local | Frontend-only/mock-backed |
| Search | Present in UI | No backend route | In-memory | Frontend-only/mock-backed |
| Followers/following | Present in UI | No route layer | In-memory graph | Frontend-only/mock-backed |
| Follow requests/status | Present in UI | No route/schema yet | In-memory only | Frontend-only/mock-backed |
| Clubs | Present in UI | No route/schema yet | Mock/local | Frontend-only/mock-backed |
| Club memberships/roles | Present in UI | No route/schema yet | Mock/local | Frontend-only/mock-backed |
| Chat/direct messages | Present in UI | No route/schema yet | Mock/local | Frontend-only/mock-backed |
| Group chats | Present in UI | No route/schema yet | Mock/local | Frontend-only/mock-backed |
| Notifications | Present in UI | No route/schema yet | Mock/local | Frontend-only/mock-backed |
| Settings persistence | Present in UI | No route/schema yet | Local/toast only | Frontend-only/mock-backed |
| Rich profile editing | Present in UI | Partial only | Mostly local state | Partially implemented |
| Experience | Present in UI | No route/schema yet | Local only | UI-only/not persisted |
| Societies | Present in UI | No route/schema yet | Local only | UI-only/not persisted |
| Achievements | Present in UI | No route/schema yet | Local only | UI-only/not persisted |
| Profile media upload | Present in UI | No route/schema yet | Local preview only | UI-only/not persisted |

## Implemented vs Intended Behavior

### Backend-backed today
- account creation for students and alumni
- login and JWT session handling
- profile fetch for authenticated user
- account deletion
- skills CRUD, if the database table exists
- certifications CRUD, if the database table exists

### Visible in the website but not backed end-to-end
- projects
- feed content and engagement
- follow graph behavior
- follow requests
- search
- clubs
- chat and group chat
- notifications
- most settings persistence
- richer profile sections

## Schema-Relevant Product Coverage
From the visible website, the eventual schema needs to cover:

- users
- student profiles
- alumni profiles
- skills
- certifications
- projects and project tags
- experiences
- societies
- achievements
- profile media references
- followers/following
- follow requests and request status
- active/online status
- posts
- post media
- likes
- comments
- saved posts
- hashtags
- clubs
- club memberships
- club roles
- chats
- group chats
- messages
- chat participants
- message read state
- notifications
- user settings/preferences/privacy controls

## Key Mismatches and Technical Debt

### Schema duplication
- `backend/prisma/schema.prisma` and `prisma/schema.prisma` duplicate each other.

### Backend runtime expectations vs schema definitions
The backend already expects some tables not currently present in the Prisma schema:

- `studentprofiles`
- `alumniprofiles`
- `skills`
- `certifications`

### Frontend expectations vs backend route coverage
The frontend already expects persistence support for projects and structurally implies much more beyond that.

### UI richness vs persistence gap
The website visually exposes more product areas than the database is currently designed to support.

### Legacy migration drift
There is at least one old migration that no longer matches the current application domain.

## Updated Schema Planning Direction
The schema planning direction should now assume:

- no teacher role
- schema redesign may alter current tables significantly
- logic comes later
- normalization is preferred over quick compatibility hacks
- the target schema should cover the full visible website, not just the already-implemented backend subset

## Immediate Use of This Document
This document should be used together with `SCHEMA_ALIGNMENT_PLAN.md` to:

1. define the normalized target schema
2. identify which current tables should be altered or replaced
3. defer application logic work until after schema approval
4. decide later which destructive cleanup actions should actually be executed
