ALTER TABLE "user_settings"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "user_settings"
SET "updated_at" = CURRENT_TIMESTAMP
WHERE "updated_at" IS NULL;
