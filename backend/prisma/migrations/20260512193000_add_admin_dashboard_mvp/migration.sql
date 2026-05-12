DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminRole') THEN
    CREATE TYPE "AdminRole" AS ENUM ('super_admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminSeverity') THEN
    CREATE TYPE "AdminSeverity" AS ENUM ('info', 'warning', 'critical');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminReportTargetType') THEN
    CREATE TYPE "AdminReportTargetType" AS ENUM ('user', 'post', 'club');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminReportStatus') THEN
    CREATE TYPE "AdminReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'rejected', 'escalated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationRequestType') THEN
    CREATE TYPE "VerificationRequestType" AS ENUM ('student', 'club');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationRequestStatus') THEN
    CREATE TYPE "VerificationRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'more_info');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnnouncementStatus') THEN
    CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'scheduled', 'published');
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_banned" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "suspended_until" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(6);

ALTER TABLE "clubs"
  ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "featured_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(6);

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "hidden_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" UUID;

CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "admin_account_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'super_admin',
  "must_change_password" BOOLEAN NOT NULL DEFAULT TRUE,
  "last_login_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("admin_account_id"),
  CONSTRAINT "admin_accounts_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "admin_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "audit_log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID NOT NULL,
  "action_type" VARCHAR(100) NOT NULL,
  "target_type" VARCHAR(50),
  "target_id" TEXT,
  "severity" "AdminSeverity" NOT NULL DEFAULT 'info',
  "summary" VARCHAR(255) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("audit_log_id"),
  CONSTRAINT "admin_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "admin_reports" (
  "report_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporter_user_id" UUID,
  "target_type" "AdminReportTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "target_user_id" UUID,
  "reason" VARCHAR(255) NOT NULL,
  "evidence" TEXT,
  "severity" "AdminSeverity" NOT NULL DEFAULT 'warning',
  "status" "AdminReportStatus" NOT NULL DEFAULT 'open',
  "report_count" INTEGER NOT NULL DEFAULT 1,
  "assigned_admin_user_id" UUID,
  "internal_notes" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(6),
  CONSTRAINT "admin_reports_pkey" PRIMARY KEY ("report_id"),
  CONSTRAINT "admin_reports_assigned_admin_user_id_fkey" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "admin_report_notes" (
  "report_note_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "note" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_report_notes_pkey" PRIMARY KEY ("report_note_id"),
  CONSTRAINT "admin_report_notes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "admin_reports"("report_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "admin_report_notes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "admin_verification_requests" (
  "verification_request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_type" "VerificationRequestType" NOT NULL,
  "target_user_id" UUID,
  "target_club_id" UUID,
  "document_urls" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "profile_preview" JSONB,
  "notes" TEXT,
  "status" "VerificationRequestStatus" NOT NULL DEFAULT 'pending',
  "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(6),
  "reviewed_by_user_id" UUID,
  CONSTRAINT "admin_verification_requests_pkey" PRIMARY KEY ("verification_request_id"),
  CONSTRAINT "admin_verification_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "admin_announcements" (
  "announcement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "audience_type" VARCHAR(50) NOT NULL,
  "audience_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "scheduled_for" TIMESTAMP(6),
  "pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "push_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_announcements_pkey" PRIMARY KEY ("announcement_id"),
  CONSTRAINT "admin_announcements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_actor_user_id" ON "admin_audit_logs"("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_created_at" ON "admin_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "idx_admin_reports_status" ON "admin_reports"("status");
CREATE INDEX IF NOT EXISTS "idx_admin_reports_assigned_admin_user_id" ON "admin_reports"("assigned_admin_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_reports_target_type" ON "admin_reports"("target_type");
CREATE INDEX IF NOT EXISTS "idx_admin_report_notes_report_id" ON "admin_report_notes"("report_id");
CREATE INDEX IF NOT EXISTS "idx_admin_report_notes_admin_user_id" ON "admin_report_notes"("admin_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_verification_requests_status" ON "admin_verification_requests"("status");
CREATE INDEX IF NOT EXISTS "idx_admin_verification_requests_request_type" ON "admin_verification_requests"("request_type");
CREATE INDEX IF NOT EXISTS "idx_admin_announcements_status" ON "admin_announcements"("status");
CREATE INDEX IF NOT EXISTS "idx_admin_announcements_created_by_user_id" ON "admin_announcements"("created_by_user_id");

WITH existing_user AS (
  SELECT user_id FROM users WHERE email = 'admin.campuslynk@gbpuat.ac.in' LIMIT 1
),
inserted_user AS (
  INSERT INTO users (
    username,
    email,
    password_hash,
    user_type,
    bio,
    headline,
    is_private,
    is_active,
    is_banned,
    updated_at
  )
  SELECT
    'campus_admin',
    'admin.campuslynk@gbpuat.ac.in',
    '$2b$12$nBiN.Q7jAvrQuJctlwFXqezOedFmXsNxjzkZg3bMzb5Q0Vu1/AYOS',
    'alumni'::"UserType",
    'CampusLink platform administrator',
    'Platform Administration',
    FALSE,
    TRUE,
    FALSE,
    NOW()
  WHERE NOT EXISTS (SELECT 1 FROM existing_user)
  RETURNING user_id
),
admin_user AS (
  SELECT user_id FROM existing_user
  UNION ALL
  SELECT user_id FROM inserted_user
)
INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status, created_at, updated_at)
SELECT user_id, 'Administration', EXTRACT(YEAR FROM CURRENT_DATE)::int, 'Platform Admin', NOW(), NOW()
FROM admin_user
ON CONFLICT (user_id) DO NOTHING;

WITH admin_user AS (
  SELECT user_id FROM users WHERE email = 'admin.campuslynk@gbpuat.ac.in' LIMIT 1
)
INSERT INTO user_settings (
  user_id,
  email_notifications,
  follow_request_notifications,
  message_notifications,
  opportunity_alerts,
  club_update_notifications,
  weekly_digest_enabled,
  show_email,
  show_projects,
  allow_messages,
  created_at,
  updated_at
)
SELECT
  user_id,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
FROM admin_user
ON CONFLICT (user_id) DO NOTHING;

WITH admin_user AS (
  SELECT user_id FROM users WHERE email = 'admin.campuslynk@gbpuat.ac.in' LIMIT 1
)
INSERT INTO admin_accounts (user_id, role, must_change_password, created_at, updated_at)
SELECT user_id, 'super_admin'::"AdminRole", TRUE, NOW(), NOW()
FROM admin_user
ON CONFLICT (user_id) DO NOTHING;
