-- Ensure chats timestamps have defaults for raw inserts
UPDATE chats
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE chats
SET updated_at = NOW()
WHERE updated_at IS NULL;

ALTER TABLE chats
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();
