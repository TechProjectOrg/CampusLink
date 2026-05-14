CREATE TABLE IF NOT EXISTS "admin_settings" (
  "admin_setting_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "settings_key" VARCHAR(100) NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("admin_setting_id"),
  CONSTRAINT "admin_settings_settings_key_key" UNIQUE ("settings_key"),
  CONSTRAINT "admin_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION
);

INSERT INTO "admin_settings" ("settings_key", "settings")
VALUES (
  'global',
  '{
    "moderation": {
      "autoEscalateCriticalReports": true,
      "retainSoftDeletedContentDays": 30
    },
    "feedRanking": {
      "allowManualIntervention": false
    },
    "uploads": {
      "maxImageMb": 10
    },
    "notifications": {
      "sendOperationalAlerts": true
    },
    "security": {
      "forcePasswordChangeForSeededAdmin": true
    },
    "rateLimiting": {
      "adminApiBurst": 60
    },
    "featureFlags": {
      "auditLogExport": false,
      "moderatorRoles": false
    }
  }'::jsonb
)
ON CONFLICT ("settings_key") DO NOTHING;
