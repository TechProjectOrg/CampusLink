CREATE TABLE "blocked_users" (
  "blocked_user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blocker_id" UUID NOT NULL,
  "blocked_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("blocked_user_id"),
  CONSTRAINT "chk_blocked_users_not_self" CHECK ("blocker_id" <> "blocked_id")
);

CREATE UNIQUE INDEX "uq_blocked_users_blocker_id_blocked_id"
  ON "blocked_users" ("blocker_id", "blocked_id");
CREATE INDEX "idx_blocked_users_blocker_id" ON "blocked_users" ("blocker_id");
CREATE INDEX "idx_blocked_users_blocked_id" ON "blocked_users" ("blocked_id");

ALTER TABLE "blocked_users"
  ADD CONSTRAINT "blocked_users_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "users" ("user_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "blocked_users"
  ADD CONSTRAINT "blocked_users_blocked_id_fkey"
  FOREIGN KEY ("blocked_id") REFERENCES "users" ("user_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "messages"
  ADD COLUMN "suppressed_for_user_id" UUID;

CREATE INDEX "idx_messages_suppressed_for_user_id"
  ON "messages" ("suppressed_for_user_id");
