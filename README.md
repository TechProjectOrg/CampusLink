# CampusLynk

CampusLynk is a full-stack campus social networking platform with student and alumni profiles, posts, comments, likes, follows, chat, clubs, notifications, moderation, admin tools, magic-link authentication, Google login support, and media uploads.

The repository is split into three main areas:

```text
CampusLink/
  backend/    Express + TypeScript + Prisma API server
  frontend/   Vite + React client application
  database/   SQL schema, local dump, and helper setup script
```

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Radix UI, TanStack Query
- Backend: Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL
- Realtime: WebSocket server on the backend
- Optional cache/realtime fanout: Upstash Redis REST
- Email: Resend
- Media storage: S3-compatible object storage

## Prerequisites

Install these before setup:

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 12 or newer
- PowerShell if using the provided Windows database setup script
- An S3-compatible bucket for production media uploads
- Resend account/API key for production email flows

Check versions:

```powershell
node -v
npm -v
psql --version
```

## Install Dependencies

Install frontend and backend packages separately:

```powershell
cd frontend
npm install

cd ..\backend
npm install
```

## Database Setup

The backend uses PostgreSQL through Prisma. For production or final evaluation, prefer Prisma migrations because they match `backend/prisma/schema.prisma` and the server code.

### 1. Create PostgreSQL Database

Create an empty database:

```powershell
psql -U postgres -c "CREATE DATABASE campuslink_db;"
```

If you use a different username, password, host, port, or database name, reflect that in `DATABASE_URL`.

### 2. Configure Backend Database URL

Create `backend/.env` and add:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/campuslink_db?schema=public"
```

### 3. Generate Prisma Client

```powershell
cd backend
npm run prisma:generate
```

### 4. Apply Migrations

For local development:

```powershell
npm run prisma:migrate
```

For production or a deployment server:

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
```

### Optional SQL Setup Files

The root `database/` folder contains SQL files for manual database setup/reference:

- `database/database_schema.sql`: SQL schema snapshot
- `database/local_db_dump.sql`: local database dump
- `database/migrate_normalize_users.sql`: username normalization migration helper
- `database/setup.ps1`: helper script that creates a database and applies `database_schema.sql`

To run the helper script:

```powershell
cd database
.\setup.ps1 -DBUser postgres -DBPassword your_password -DBName campuslink_db
```

Note: the backend Prisma migrations are the recommended path for the final app. The root `database/` folder is the only database asset folder that should be kept in the repository.

## Backend Setup

Create `backend/.env`:

```env
PORT=4000
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/campuslink_db?schema=public"
JWT_SECRET="replace-with-a-random-secret-at-least-32-characters-long"
JWT_EXPIRES_IN="12h"

# Comma-separated frontend origins allowed by CORS.
CORS_ORIGINS="http://localhost:3000,https://your-frontend-domain.com"

# URLs used in auth emails and redirects.
FRONTEND_URL="http://localhost:3000"
AUTH_CLIENT_URL="http://localhost:3000"
APP_BASE_URL="http://localhost:3000"
API_BASE_URL="http://localhost:4000"

# Email authentication and notifications.
RESEND_API_KEY="your_resend_api_key"
RESEND_FROM_EMAIL="CampusLynk <onboarding@resend.dev>"
AUTH_MAGIC_LINK_FROM_EMAIL="CampusLynk <onboarding@resend.dev>"
AUTH_VERIFICATION_FROM_EMAIL="CampusLynk <onboarding@resend.dev>"
AUTH_ALLOWED_EMAIL_DOMAIN="gbpuat.ac.in"

# Google login. Also set this in frontend/.env as VITE_GOOGLE_CLIENT_ID.
GOOGLE_CLIENT_ID="your_google_oauth_client_id"

# S3-compatible media storage.
STORAGE_BUCKET_NAME="your_bucket_name"
STORAGE_S3_REGION="ap-south-1"
STORAGE_S3_ACCESS_KEY_ID="your_access_key"
STORAGE_S3_SECRET_ACCESS_KEY="your_secret_key"
STORAGE_S3_PUBLIC_BASE_URL="https://your-public-bucket-domain"

# Optional S3 endpoint for providers other than AWS S3.
# STORAGE_S3_ENDPOINT="https://your-s3-compatible-endpoint"

# Optional Redis cache/realtime support.
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
UPSTASH_REDIS_STREAMS_ENABLED="true"

# Optional web push support.
WEB_PUSH_VAPID_PUBLIC_KEY=""
WEB_PUSH_VAPID_PRIVATE_KEY=""
WEB_PUSH_SUBJECT="mailto:admin@example.com"

# Optional dedicated encryption key. If omitted, JWT_SECRET is used as fallback.
ENCRYPTION_KEY=""
```

Important backend notes:

- `JWT_SECRET` is required and must be at least 32 characters.
- `DATABASE_URL` is required for all API/database features.
- S3 variables are required for routes that upload profile photos, post media, chat media, club media, certificates, or verification proofs.
- Resend variables are required for magic links, OTP, password reset, and verification emails.
- Redis variables are optional; without them the app still works, but cache/realtime fanout features run in local fallback mode.

## Frontend Setup

Create `frontend/.env`:

```env
VITE_API_URL="http://localhost:4000"
VITE_GOOGLE_CLIENT_ID="your_google_oauth_client_id"
```

Frontend notes:

- In local development, if `VITE_API_URL` is missing and the app runs on `localhost`, the frontend falls back to `http://localhost:4000`.
- In production, always set `VITE_API_URL` to the deployed backend HTTPS URL.
- The realtime WebSocket URL is derived from `VITE_API_URL` and connects to `/ws`.

## Run Locally

Use two terminals.

Terminal 1, backend:

```powershell
cd backend
npm run dev
```

Backend default URL:

```text
http://localhost:4000
```

Terminal 2, frontend:

```powershell
cd frontend
npm run dev
```

Frontend default URL:

```text
http://localhost:3000
```

Open `http://localhost:3000` in the browser.

## Health Check

After the backend is running, verify:

```powershell
curl http://localhost:4000/health
```

The health response reports API routes and dependency status, including the database and optional Redis status.

## Production Build

### Backend

```powershell
cd backend
npm install
npm run prisma:generate
npx prisma migrate deploy --schema prisma/schema.prisma
npm run build
npm start
```

The compiled backend entry point is:

```text
backend/server/dist/server.js
```

Set production environment variables on the server or hosting provider before starting the backend.

### Frontend

```powershell
cd frontend
npm install
npm run build
```

The production frontend build is generated in:

```text
frontend/build/
```

Deploy that folder to a static hosting provider such as Vercel, Netlify, Cloudflare Pages, Nginx, or any static file server. Make sure `VITE_API_URL` points to the production backend URL before building.

To preview the production frontend build locally:

```powershell
npm run preview
```

## Production Deployment Checklist

Before submission or production launch, verify:

- PostgreSQL database exists and migrations have been applied.
- `backend/.env` or server environment contains all required production variables.
- `frontend/.env` contains the production `VITE_API_URL`.
- Backend build succeeds with `npm run build`.
- Frontend build succeeds with `npm run build`.
- Backend `/health` returns a healthy database status.
- Production frontend domain is included in backend `CORS_ORIGINS`.
- Resend sender email/domain is configured and verified.
- S3 bucket credentials work for file uploads.
- Google OAuth client allows the production frontend origin.
- No real secrets are committed to Git.

## Useful Commands

Backend:

```powershell
cd backend
npm run dev
npm run build
npm start
npm run prisma:generate
npm run prisma:migrate
npx prisma migrate deploy --schema prisma/schema.prisma
npm run username:normalize
```

Frontend:

```powershell
cd frontend
npm run dev
npm run build
npm run preview
```

Database:

```powershell
psql -U postgres -d campuslink_db
\dt
\q
```

## Troubleshooting

### Backend Cannot Connect To Database

- Confirm PostgreSQL is running.
- Confirm the database exists: `psql -U postgres -c "\l"`.
- Confirm `DATABASE_URL` has the correct username, password, host, port, and database.
- Run `npm run prisma:generate` after installing dependencies.
- Run migrations before starting the production server.

### CORS Errors In Browser

- Add the frontend URL to backend `CORS_ORIGINS`.
- Use exact origins only, for example `https://campuslynk.example.com`.
- Do not include paths in `CORS_ORIGINS`.

### Frontend Calls The Wrong API

- Set `VITE_API_URL` in `frontend/.env`.
- Rebuild the frontend after changing Vite environment variables.
- In production, use the deployed backend URL, not `localhost`.

### Magic Links Or OTP Emails Fail

- Set `RESEND_API_KEY`.
- Set a valid `RESEND_FROM_EMAIL` or auth-specific sender email.
- Verify the sender/domain in Resend for production.
- Confirm `AUTH_CLIENT_URL` or `FRONTEND_URL` points to the frontend URL.

### Media Uploads Fail

- Set bucket, region, access key, secret key, and public base URL.
- Confirm the bucket allows the configured credentials to upload and delete objects.
- If using non-AWS storage, set `STORAGE_S3_ENDPOINT`.

### Web Push Does Not Work

- Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`.
- Serve the frontend over HTTPS in production.

## Security Notes

- Never commit `.env` files or real credentials.
- Use a long random `JWT_SECRET` in production.
- Use HTTPS for both frontend and backend in production.
- Restrict CORS to known frontend domains.
- Rotate leaked API keys immediately.

## Project Status

This README is written for the final production/submission iteration of CampusLynk. Follow the Prisma migration path for the backend database and use the root `database/` SQL files only when a manual SQL setup or inspection is required.
