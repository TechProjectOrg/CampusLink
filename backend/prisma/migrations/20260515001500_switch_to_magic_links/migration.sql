ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(6);

ALTER TABLE "auth_onboarding_sessions"
  ALTER COLUMN "provider" TYPE TEXT USING "provider"::text;

ALTER TABLE "users"
  ALTER COLUMN "auth_provider" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "auth_provider" TYPE TEXT USING "auth_provider"::text;

UPDATE "users"
SET "auth_provider" = 'magic_link'
WHERE "auth_provider" = 'local';

DROP TYPE IF EXISTS "AuthProvider_old";
ALTER TYPE "AuthProvider" RENAME TO "AuthProvider_old";
CREATE TYPE "AuthProvider" AS ENUM ('google', 'magic_link');

ALTER TABLE "users"
  ALTER COLUMN "auth_provider" TYPE "AuthProvider" USING "auth_provider"::"AuthProvider";

ALTER TABLE "auth_onboarding_sessions"
  ALTER COLUMN "provider" TYPE "AuthProvider" USING "provider"::"AuthProvider";

ALTER TABLE "users"
  ALTER COLUMN "auth_provider" SET DEFAULT 'magic_link'::"AuthProvider";

DROP TYPE "AuthProvider_old";

DROP TABLE IF EXISTS "auth_otp_challenges";
