-- Migration: 20260424120000_add_chat_columns
-- Adds is_request flag to chats and reactions JSONB to messages

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS is_request BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}';

-- Index for quickly fetching pending message requests for a user
CREATE INDEX IF NOT EXISTS idx_chats_is_request
  ON chats (is_request)
  WHERE is_request = TRUE;
