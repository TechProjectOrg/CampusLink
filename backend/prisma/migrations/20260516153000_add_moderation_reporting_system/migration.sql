ALTER TYPE "AdminReportTargetType" ADD VALUE IF NOT EXISTS 'comment';
ALTER TYPE "AdminReportTargetType" ADD VALUE IF NOT EXISTS 'message';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "banned_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "suspension_started_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "warning_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_warning_at" TIMESTAMP(6);

ALTER TABLE "admin_reports"
  ADD COLUMN IF NOT EXISTS "conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "action_taken" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "context_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "last_reported_at" TIMESTAMP(6);

UPDATE "admin_reports"
SET "last_reported_at" = COALESCE("last_reported_at", "updated_at", "created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminReportStatus') THEN
    ALTER TYPE "AdminReportStatus" RENAME TO "AdminReportStatus_old";
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminReportStatus" AS ENUM ('pending', 'under_review', 'resolved', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "admin_reports"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "admin_reports"
  ALTER COLUMN "status" TYPE "AdminReportStatus"
  USING (
    CASE "status"::text
      WHEN 'open' THEN 'pending'
      WHEN 'reviewing' THEN 'under_review'
      WHEN 'resolved' THEN 'resolved'
      WHEN 'rejected' THEN 'dismissed'
      WHEN 'escalated' THEN 'under_review'
      ELSE 'pending'
    END
  )::"AdminReportStatus";

ALTER TABLE "admin_reports"
  ALTER COLUMN "status" SET DEFAULT 'pending';

DROP TYPE IF EXISTS "AdminReportStatus_old";

CREATE TABLE IF NOT EXISTS "report_submissions" (
  "report_submission_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "reporter_user_id" UUID NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "report_submissions_pkey" PRIMARY KEY ("report_submission_id"),
  CONSTRAINT "report_submissions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "admin_reports"("report_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "report_submissions_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_report_submissions_report_id" ON "report_submissions"("report_id");
CREATE INDEX IF NOT EXISTS "idx_report_submissions_reporter_user_id" ON "report_submissions"("reporter_user_id");

INSERT INTO "report_submissions" ("report_id", "reporter_user_id", "reason", "description", "created_at")
SELECT
  r."report_id",
  r."reporter_user_id",
  r."reason",
  r."evidence",
  r."created_at"
FROM "admin_reports" r
WHERE r."reporter_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "report_submissions" s
    WHERE s."report_id" = r."report_id"
      AND s."reporter_user_id" = r."reporter_user_id"
  );

DO $$
BEGIN
  CREATE TYPE "ModerationActionType" AS ENUM (
    'warn',
    'suspend',
    'unsuspend',
    'ban',
    'unban',
    'delete_post',
    'delete_comment',
    'delete_message',
    'delete_media',
    'dismiss',
    'resolve'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "moderation_logs" (
  "moderation_log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_user_id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "report_id" UUID,
  "action_type" "ModerationActionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "duration_seconds" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("moderation_log_id"),
  CONSTRAINT "moderation_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "moderation_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "moderation_logs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "admin_reports"("report_id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_moderation_logs_admin_user_id" ON "moderation_logs"("admin_user_id");
CREATE INDEX IF NOT EXISTS "idx_moderation_logs_target_user_id" ON "moderation_logs"("target_user_id");
CREATE INDEX IF NOT EXISTS "idx_moderation_logs_report_id" ON "moderation_logs"("report_id");
CREATE INDEX IF NOT EXISTS "idx_moderation_logs_created_at" ON "moderation_logs"("created_at");

ALTER TABLE "admin_reports"
  ADD CONSTRAINT "admin_reports_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_admin_reports_target_id" ON "admin_reports"("target_id");
CREATE INDEX IF NOT EXISTS "idx_admin_reports_target_user_id" ON "admin_reports"("target_user_id");
