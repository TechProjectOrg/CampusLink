CREATE TABLE "user_sessions" (
  "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "user_agent" TEXT,
  "browser_name" VARCHAR(100),
  "platform" VARCHAR(100),
  "device_name" VARCHAR(100),
  "location_label" VARCHAR(255),
  "ip_address" VARCHAR(45),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  "last_seen_at" TIMESTAMP(6),
  "revoked_at" TIMESTAMP(6),
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("session_id"),
  CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions"("user_id");
CREATE INDEX "idx_user_sessions_revoked_at" ON "user_sessions"("revoked_at");