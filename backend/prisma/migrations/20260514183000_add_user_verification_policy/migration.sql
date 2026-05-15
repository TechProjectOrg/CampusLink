DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserVerificationState') THEN
    CREATE TYPE "UserVerificationState" AS ENUM (
      'student_google_verified',
      'alumni_pending_review',
      'alumni_verified',
      'alumni_rejected'
    );
  END IF;
END $$;

ALTER TYPE "VerificationRequestType" ADD VALUE IF NOT EXISTS 'alumni';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "verification_state" "UserVerificationState";

ALTER TABLE "admin_verification_requests"
  ADD COLUMN IF NOT EXISTS "decision_note" TEXT;

UPDATE "users"
SET "verification_state" = CASE
  WHEN "user_type" = 'student'::"UserType" THEN 'student_google_verified'::"UserVerificationState"
  WHEN "user_type" = 'alumni'::"UserType" AND "verified_at" IS NOT NULL THEN 'alumni_verified'::"UserVerificationState"
  WHEN "user_type" = 'alumni'::"UserType" THEN 'alumni_pending_review'::"UserVerificationState"
  ELSE "verification_state"
END
WHERE "verification_state" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_users_verification_state" ON "users"("verification_state");
