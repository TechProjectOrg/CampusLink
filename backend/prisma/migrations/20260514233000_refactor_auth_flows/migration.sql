DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthProvider') THEN
    CREATE TYPE "AuthProvider" AS ENUM ('google', 'local');
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "auth_provider" "AuthProvider" NOT NULL DEFAULT 'local'::"AuthProvider",
  ADD COLUMN IF NOT EXISTS "google_subject" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(6);

UPDATE "users"
SET
  "auth_provider" = COALESCE("auth_provider", 'local'::"AuthProvider"),
  "onboarding_completed_at" = COALESCE("onboarding_completed_at", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_subject_key" ON "users"("google_subject");
CREATE INDEX IF NOT EXISTS "idx_users_auth_provider" ON "users"("auth_provider");

CREATE TABLE IF NOT EXISTS "auth_otp_challenges" (
  "auth_otp_challenge_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(100) NOT NULL,
  "purpose" VARCHAR(50) NOT NULL,
  "otp_hash" VARCHAR(255) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "consumed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "auth_otp_challenges_pkey" PRIMARY KEY ("auth_otp_challenge_id")
);

CREATE INDEX IF NOT EXISTS "idx_auth_otp_challenges_email_purpose"
  ON "auth_otp_challenges"("email", "purpose");

CREATE INDEX IF NOT EXISTS "idx_auth_otp_challenges_expires_at"
  ON "auth_otp_challenges"("expires_at");

CREATE TABLE IF NOT EXISTS "auth_onboarding_sessions" (
  "auth_onboarding_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "AuthProvider" NOT NULL,
  "email" VARCHAR(100) NOT NULL,
  "google_subject" VARCHAR(255),
  "full_name" VARCHAR(150) NOT NULL,
  "profile_photo_url" TEXT,
  "suggested_username" VARCHAR(50),
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "completed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "auth_onboarding_sessions_pkey" PRIMARY KEY ("auth_onboarding_session_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_onboarding_sessions_google_subject_key"
  ON "auth_onboarding_sessions"("google_subject");

CREATE INDEX IF NOT EXISTS "idx_auth_onboarding_sessions_email"
  ON "auth_onboarding_sessions"("email");

CREATE INDEX IF NOT EXISTS "idx_auth_onboarding_sessions_expires_at"
  ON "auth_onboarding_sessions"("expires_at");
