UPDATE "post_comments"
SET "updated_at" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
WHERE "updated_at" IS NULL;

UPDATE "post_comments"
SET "created_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE "created_at" IS NULL;

ALTER TABLE "post_comments"
  ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
