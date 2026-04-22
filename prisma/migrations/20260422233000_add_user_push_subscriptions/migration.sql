CREATE TABLE IF NOT EXISTS "user_push_subscriptions" (
  "push_subscription_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh_key" TEXT NOT NULL,
  "auth_key" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(6),
  CONSTRAINT "user_push_subscriptions_pkey" PRIMARY KEY ("push_subscription_id"),
  CONSTRAINT "user_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_push_subscriptions_endpoint_key" UNIQUE ("endpoint")
);

CREATE INDEX IF NOT EXISTS "idx_user_push_subscriptions_user_id"
  ON "user_push_subscriptions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_push_subscriptions_revoked_at"
  ON "user_push_subscriptions" ("revoked_at");
