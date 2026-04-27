-- Ensure messages timestamps have defaults for raw inserts
UPDATE messages
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE messages
SET updated_at = NOW()
WHERE updated_at IS NULL;

ALTER TABLE messages
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();
