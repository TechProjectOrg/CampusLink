-- Add monotonic sequence to messages for consistent ordering
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_sequence BIGINT;

-- Backfill message_sequence based on creation order within each chat
WITH ranked_messages AS (
  SELECT
    message_id,
    chat_id,
    ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at ASC, message_id ASC) as seq
  FROM messages
  WHERE message_sequence IS NULL
)
UPDATE messages m
SET message_sequence = rm.seq
FROM ranked_messages rm
WHERE m.message_id = rm.message_id;

-- Add description and metadata for group chats
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS group_metadata JSONB DEFAULT '{}';

-- Create index for message ordering
CREATE INDEX IF NOT EXISTS idx_messages_chat_sequence ON messages(chat_id, message_sequence DESC);

-- Create index for chat participant lookups
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_joined ON chat_participants(chat_id, joined_at DESC);

-- Add group_add_preference to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS group_add_preference VARCHAR(20) DEFAULT 'everyone' CHECK (group_add_preference IN ('everyone', 'friends', 'none'));

-- Create a unique constraint on club.linked_chat_id to ensure 1:1 relationship
ALTER TABLE clubs
  ADD CONSTRAINT uq_clubs_linked_chat_id UNIQUE (linked_chat_id) WHERE linked_chat_id IS NOT NULL;

-- Create index for club chat lookups
CREATE INDEX IF NOT EXISTS idx_clubs_linked_chat_id ON clubs(linked_chat_id) WHERE linked_chat_id IS NOT NULL;
